"""Mux the actual-UI fixture recording with local TTS narration; no network or public upload."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
chapters = json.loads((root / 'evidence/demo-narration-plan.json').read_text(encoding='utf-8'))
audio = root / 'evidence/video-raw/audio'
command = ['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y']
filters = []
for index, chapter in enumerate(chapters):
    file = audio / f'chapter-{index}.wav'
    details = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(file)]))
    duration = float(details['format']['duration'])
    target = chapter['seconds']
    tempo = max(1.0, duration / (target - 0.5))
    if tempo > 1.5:
        raise RuntimeError('Narration needs review rather than excessive speedup')
    command += ['-i', str(file)]
    filters.append(f'[{index}:a]atempo={tempo:.5f},apad=whole_dur={target},atrim=duration={target},asetpts=PTS-STARTPTS[a{index}]')
filters.append(''.join(f'[a{i}]' for i in range(len(chapters))) + f'concat=n={len(chapters)}:v=0:a=1[out]')
track = root / 'evidence/video-raw/narration.wav'
subprocess.run(command + ['-filter_complex', ';'.join(filters), '-map', '[out]', str(track)], check=True)
output = root / 'evidence/marginguard-fixture-demo.mp4'
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', str(root / 'evidence/marginguard-fixture-walkthrough.webm'), '-i', str(track), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-movflags', '+faststart', str(output)], check=True)
details = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration,size', '-of', 'json', str(output)]))
assert float(details['format']['duration']) < 180
print(json.dumps({'file': str(output), 'duration_seconds': float(details['format']['duration']), 'bytes': int(details['format']['size']), 'scope': 'Actual local UI with labeled offline fixtures and local synthetic narration. Review draft, no live API proof and no public upload.'}, indent=2))
