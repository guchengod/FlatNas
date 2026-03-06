Set-Location "D:\FlatNas(Go)\frontend"
$env:Path = "D:\Program Files\Go\bin;" + $env:Path

# 热更新后端（无需每次手动编译）
& "D:\Program Files\nodejs\node.exe" "D:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" run server:hot