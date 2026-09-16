@echo off
set GIT="C:\Program Files\Git\cmd\git.exe"
%GIT% config user.email "easypos@deploy.com"
%GIT% config user.name "EfendiAga"
%GIT% remote add origin https://github.com/EfendiAga/MARKET-POS-MAIN.git
%GIT% branch -M main
%GIT% add .
%GIT% commit -m "feat: migrate to Firebase Firestore backend with auth"
echo Done - ready to push!
