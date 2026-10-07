import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import worker

class WorkerTest(unittest.TestCase):
    def test_catalogue_snapshot_is_distinct(self):
        data = {'sets': [{'entries': [{'basque': 'Kaixo'}, {'basque': 'Agur'}]},
                         {'entries': [{'basque': 'Kaixo'}]}]}
        with patch('worker.urllib.request.urlopen', return_value=io.BytesIO(json.dumps(data).encode())):
            self.assertEqual(worker.texts('http://web/api/public/content'), ['Agur', 'Kaixo'])

    def test_failed_encoding_never_publishes_and_success_is_reused(self):
        class Voice:
            def synthesize_wav(self, text, wav):
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(22050)
                wav.writeframes(b'\0\0' * 100)
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp)
            with patch('worker.subprocess.run', side_effect=RuntimeError('encoder failed')):
                with self.assertRaises(RuntimeError): worker.render(Voice(), 'Kaixo', output)
            self.assertEqual(list(output.iterdir()), [])
            def encode(args, **kwargs): Path(args[-1]).write_bytes(b'mp3')
            with patch('worker.subprocess.run', side_effect=encode) as encoder:
                self.assertTrue(worker.render(Voice(), 'Kaixo', output))
                self.assertFalse(worker.render(Voice(), 'Kaixo', output))
                self.assertEqual(encoder.call_count, 1)
            self.assertEqual(len(list(output.iterdir())), 1)

    def test_hash_contract(self):
        self.assertEqual(worker.clip_key('Kaixo'), hashlib.sha256((worker.PROFILE_HASH+'\0Kaixo').encode()).hexdigest())
        self.assertNotEqual(worker.clip_key('Kaixo'), worker.clip_key('kaixo'))

if __name__ == '__main__': unittest.main()
