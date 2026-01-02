@echo off
setlocal
cd /d %~dp0\..
node server\src\index.js
