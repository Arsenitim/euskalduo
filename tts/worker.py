"""Offline speech generation from the published catalogue; no server is exposed."""
import argparse
import hashlib
import json
import logging
import shutil
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.request
import wave

PROFILE_PATH = Path(__file__).with_name('profile.json')
PROFILE = json.loads(PROFILE_PATH.read_text())
# Hash the exact shared profile bytes, then NUL, then the stored UTF-8 text.
PROFILE_HASH = hashlib.sha256(PROFILE_PATH.read_bytes()).hexdigest()


def clip_key(text):
    return hashlib.sha256((PROFILE_HASH + '\0' + text).encode('utf-8')).hexdigest()


def verify_models(model_dir):
    for name, checksum in PROFILE['files'].items():
        path = model_dir / name
        if not path.is_file():
            raise RuntimeError(f'Missing {name}; run the setup command')
        with path.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != checksum:
                raise RuntimeError(f'Invalid {name}; run the setup command')


def setup(model_dir):
    model_dir.mkdir(parents=True, exist_ok=True)
    for name, checksum in PROFILE['files'].items():
        path = model_dir / name
        if path.exists():
            with path.open('rb') as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() == checksum:
                    continue
        url = f"https://huggingface.co/itzune/maider-tts/resolve/{PROFILE['revision']}/{name}"
        with tempfile.NamedTemporaryFile(dir=model_dir, delete=False) as tmp:
            pending = Path(tmp.name)
        try:
            with urllib.request.urlopen(url, timeout=120) as response, pending.open('wb') as dest:
                shutil.copyfileobj(response, dest)
            with pending.open('rb') as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() != checksum:
                    raise RuntimeError(f'Checksum mismatch: {name}')
            pending.chmod(0o644)
            pending.replace(path)
        finally:
            pending.unlink(missing_ok=True)
    verify_models(model_dir)


def catalogue_texts(content_url):
    # The same public catalogue learners use; never access the SQLite volume.
    with urllib.request.urlopen(content_url, timeout=30) as response:
        content = json.load(response)
    if not isinstance(content.get('sets'), list):
        raise ValueError('Invalid public catalogue')
    found = {entry['basque'] for homework in content['sets'] for entry in homework['entries']}
    found.update(story['transcript'] for story in content.get('stories') or [])
    return found


def queued_texts(queue_path):
    """Texts the API asked for, drafts included, so audio exists before publishing."""
    if queue_path is None or not queue_path.is_file():
        return set()
    data = json.loads(queue_path.read_text(encoding='utf-8'))
    items = data.get('texts') if isinstance(data, dict) else None
    if not isinstance(items, list):
        raise ValueError('Invalid speech queue')
    return {text for text in items if isinstance(text, str) and text.strip()}


def texts(content_url, queue_path=None):
    found = set()
    errors = []
    for source in (lambda: catalogue_texts(content_url), lambda: queued_texts(queue_path)):
        try:
            found.update(source())
        except (OSError, ValueError, KeyError, TypeError) as error:
            errors.append(error)
    if errors and not found:
        raise errors[0]
    if errors:
        logging.warning('One text source failed: %s', errors[0])
    return sorted(found)


def write_json(path, data):
    """Atomic write, so the API never reads half a file."""
    with tempfile.NamedTemporaryFile('w', dir=path.parent, prefix='.tmp-', suffix='.json',
                                     delete=False, encoding='utf-8') as tmp:
        json.dump(data, tmp)
        pending = Path(tmp.name)
    pending.chmod(0o644)
    pending.replace(path)


def probe_duration_ms(mp3_path):
    result = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                             '-of', 'default=noprint_wrappers=1:nokey=1', str(mp3_path)],
                            check=True, capture_output=True, text=True, timeout=60)
    return round(float(result.stdout.strip()) * 1000)


def ensure_sidecar(target, duration_ms=None):
    """'<key>.json' next to a clip: its measured duration (the API reads it)."""
    sidecar = target.with_suffix('.json')
    if sidecar.is_file():
        return
    if duration_ms is None:
        duration_ms = probe_duration_ms(target)
    write_json(sidecar, {'durationMs': int(duration_ms), 'profileHash': PROFILE_HASH})


def render(voice, text, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / (clip_key(text) + '.mp3')
    if target.is_file() and target.stat().st_size > 0:
        ensure_sidecar(target)
        return False
    with tempfile.TemporaryDirectory(dir=output_dir, prefix='.render-') as tmp:
        wav_path = Path(tmp) / 'voice.wav'
        mp3_path = Path(tmp) / 'voice.mp3'
        with wave.open(str(wav_path), 'wb') as wav:
            voice.synthesize_wav(text, wav)
        with wave.open(str(wav_path), 'rb') as wav:
            duration_ms = round(wav.getnframes() * 1000 / wav.getframerate())
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(wav_path),
                        '-ac', '1', '-ar', '22050', '-codec:a', 'libmp3lame', '-b:a', '64k',
                        '-map_metadata', '-1', str(mp3_path)], check=True, timeout=120)
        if mp3_path.stat().st_size == 0:
            raise RuntimeError('Empty encoded audio')
        mp3_path.chmod(0o644)
        mp3_path.replace(target)
    ensure_sidecar(target, duration_ms)
    return True


def record_failures(output_dir, failures):
    """status.json: texts that failed, by clip key, so the admin can see them."""
    output_dir.mkdir(parents=True, exist_ok=True)
    write_json(output_dir / 'status.json', {'failed': failures})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['setup', 'once', 'watch'], default='watch', nargs='?')
    parser.add_argument('--content-url', default='http://web:8080/api/public/content')
    parser.add_argument('--models', type=Path, default=Path('/models'))
    parser.add_argument('--output', type=Path, default=Path('/audio'))
    parser.add_argument('--queue', type=Path, default=Path('/speech/requests.json'))
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
    if args.command == 'setup':
        setup(args.models)
        return
    verify_models(args.models)
    import onnxruntime
    onnxruntime.disable_telemetry_events()
    from piper import PiperVoice
    voice = PiperVoice.load(str(args.models / 'eu-maider-medium.onnx'), use_cuda=False)
    failures = {}
    reported = {}
    while True:
        generated = reused = failed = 0
        try:
            for text in texts(args.content_url, args.queue):
                if failures.get(text, 0) > time.monotonic():
                    continue
                key = clip_key(text)
                try:
                    if render(voice, text, args.output):
                        generated += 1
                    else:
                        reused += 1
                    failures.pop(text, None)
                    reported.pop(key, None)
                except Exception as error:
                    failed += 1
                    failures[text] = time.monotonic() + 300
                    reported[key] = {'at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
                                     'message': f'{type(error).__name__}: {error}'[:200]}
                    logging.exception('Clip generation failed: %s', key)
            record_failures(args.output, reported)
            logging.info('Batch: generated=%s reused=%s failed=%s', generated, reused, failed)
        except (OSError, ValueError, KeyError, TypeError):
            failed += 1
            logging.exception('Content not ready; retrying next pass')
        if args.command == 'once':
            if failed:
                raise SystemExit(1)
            return
        time.sleep(60)


if __name__ == '__main__':
    main()
