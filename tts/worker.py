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


def texts(content_url):
    # The same public catalogue learners use; never access the SQLite volume.
    with urllib.request.urlopen(content_url, timeout=30) as response:
        content = json.load(response)
    if not isinstance(content.get('sets'), list):
        raise ValueError('Invalid public catalogue')
    return sorted({entry['basque'] for homework in content['sets']
                   for entry in homework['entries']})


def render(voice, text, output_dir):
    output_dir.mkdir(parents=True, exist_ok=True)
    target = output_dir / (clip_key(text) + '.mp3')
    if target.is_file() and target.stat().st_size > 0:
        return False
    with tempfile.TemporaryDirectory(dir=output_dir, prefix='.render-') as tmp:
        wav_path = Path(tmp) / 'voice.wav'
        mp3_path = Path(tmp) / 'voice.mp3'
        with wave.open(str(wav_path), 'wb') as wav:
            voice.synthesize_wav(text, wav)
        subprocess.run(['ffmpeg', '-nostdin', '-v', 'error', '-y', '-i', str(wav_path),
                        '-ac', '1', '-ar', '22050', '-codec:a', 'libmp3lame', '-b:a', '64k',
                        '-map_metadata', '-1', str(mp3_path)], check=True, timeout=120)
        if mp3_path.stat().st_size == 0:
            raise RuntimeError('Empty encoded audio')
        mp3_path.chmod(0o644)
        mp3_path.replace(target)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('command', choices=['setup', 'once', 'watch'], default='watch', nargs='?')
    parser.add_argument('--content-url', default='http://web:8080/api/public/content')
    parser.add_argument('--models', type=Path, default=Path('/models'))
    parser.add_argument('--output', type=Path, default=Path('/audio'))
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
    while True:
        generated = reused = failed = 0
        try:
            for text in texts(args.content_url):
                if failures.get(text, 0) > time.monotonic():
                    continue
                try:
                    if render(voice, text, args.output):
                        generated += 1
                    else:
                        reused += 1
                    failures.pop(text, None)
                except Exception:
                    failed += 1
                    failures[text] = time.monotonic() + 300
                    logging.exception('Clip generation failed: %s', clip_key(text))
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
