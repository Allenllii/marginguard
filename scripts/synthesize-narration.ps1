$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$projectRoot = Split-Path -Parent $PSScriptRoot
$chapters = Get-Content -LiteralPath (Join-Path $projectRoot 'evidence/demo-narration-plan.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$audioDirectory = Join-Path $projectRoot 'evidence/video-raw/audio'
New-Item -ItemType Directory -Path $audioDirectory -Force | Out-Null
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.SelectVoiceByHints([System.Speech.Synthesis.VoiceGender]::Female, [System.Speech.Synthesis.VoiceAge]::Adult, 0, [System.Globalization.CultureInfo]::GetCultureInfo('en-US'))
$voice.Rate = 1
for ($chapterIndex = 0; $chapterIndex -lt $chapters.Count; $chapterIndex++) {
  $audioPath = Join-Path $audioDirectory ('chapter-' + $chapterIndex + '.wav')
  $voice.SetOutputToWaveFile($audioPath)
  $voice.Speak([string]$chapters[$chapterIndex].text)
  $voice.SetOutputToNull()
}
$voice.Dispose()
Write-Output 'Generated local English synthetic narration from the reviewed fixture script.'
