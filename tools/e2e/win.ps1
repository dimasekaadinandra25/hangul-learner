# Called by e2e.js. Prints one JSON value. usage: win.ps1 <command> [args]
#   build | pid | state <title> | close <title> | trayclick | traymenu | traycmd <id> | workarea | hotkey <letter> | hotkeyspace | runkey
#   clipsave | clipset <base64 utf-8 text> | cliprestore   (the clipboard is saved first and put back after the test)
param([string]$cmd, [string]$a1)
$dll = Join-Path $env:TEMP 'hangul-e2e-win.dll'
if ($cmd -eq 'build') { Remove-Item $dll -ErrorAction SilentlyContinue; Add-Type -Path (Join-Path $PSScriptRoot 'win.cs') -OutputAssembly $dll; 'true'; return }
Add-Type -Path $dll
function AppPid { $p = Get-Process hangul-learner -ErrorAction SilentlyContinue | Select-Object -First 1; if ($p) { [uint32]$p.Id } else { [uint32]0 } }
switch ($cmd) {
  'pid' { AppPid }
  'state' { [HL]::State((AppPid), $a1) }
  'close' { ([HL]::Close((AppPid), $a1)).ToString().ToLower() }
  'trayclick' { ([HL]::TrayClick((AppPid), 0x202)).ToString().ToLower() }   # WM_LBUTTONUP
  'traymenu' { [HL]::TrayMenu((AppPid)) }
  'traycmd' { ([HL]::TrayCommand((AppPid), [uint32]$a1)).ToString().ToLower() }
  'hotkey' { [HL]::Hotkey([byte][char]$a1.ToUpper()[0]); 'true' }
  'hotkeyspace' { [HL]::Hotkey(0x20); 'true' }
  'runkey' { $v = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -ErrorAction SilentlyContinue; $hit = $v.PSObject.Properties | Where-Object { "$($_.Value)" -like '*hangul-learner*' } | Select-Object -First 1; if ($hit) { ConvertTo-Json @{name = $hit.Name; value = "$($hit.Value)" } -Compress } else { 'null' } }
  'clipsave' {
    Add-Type -AssemblyName System.Windows.Forms; $c = [System.Windows.Forms.Clipboard]
    if ($c::ContainsImage() -or $c::ContainsFileDropList() -or $c::ContainsAudio()) { 'false'; return } # only plain text can be put back exactly
    [IO.File]::WriteAllText((Join-Path $env:TEMP 'hangul-e2e-clip.txt'), $(if ($c::ContainsText()) { $c::GetText() } else { '' }), [Text.Encoding]::UTF8); 'true' }
  'clipset' { Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Clipboard]::SetText([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($a1))); 'true' }
  'cliprestore' {
    Add-Type -AssemblyName System.Windows.Forms; $f = Join-Path $env:TEMP 'hangul-e2e-clip.txt'
    if (Test-Path $f) { $t = [IO.File]::ReadAllText($f, [Text.Encoding]::UTF8); if ($t) { [System.Windows.Forms.Clipboard]::SetText($t) } else { [System.Windows.Forms.Clipboard]::Clear() }; Remove-Item $f }; 'true' }
  'workarea' { Add-Type -AssemblyName System.Windows.Forms; $w = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea; "[$($w.Left),$($w.Top),$($w.Right),$($w.Bottom)]" }
}
