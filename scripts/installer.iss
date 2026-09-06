; Oberleaf Inno Setup Script
; Generates Oberleaf-Setup.exe installer

#define MyAppName "Oberleaf"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "Oberleaf Scholarly Studio"
#define MyAppURL "https://github.com/sahgyan9/Oberleaf"
#define MyAppExeName "wscript.exe"

[Setup]
AppId={{D37F871A-5431-4199-8D7B-1BF40EC01662}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={localappdata}\{#MyAppName}
DisableProgramGroupPage=yes
OutputBaseFilename=Oberleaf-Setup
SetupIconFile=..\assets\icon.ico
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked

[Files]
Source: "..\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs; Excludes: "node_modules,dist,.git,.tmp,logs"

[Icons]
Name: "{autoprograms}\{#MyAppName}"; Filename: "{sys}\{#MyAppExeName}"; Parameters: """{app}\scripts\launch.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\icon.ico"; Comment: "Oberleaf - Local LaTeX Editor"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{sys}\{#MyAppExeName}"; Parameters: """{app}\scripts\launch.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\assets\icon.ico"; Tasks: desktopicon; Comment: "Oberleaf - Local LaTeX Editor"

[Run]
Filename: "cmd.exe"; Parameters: "/c npm install"; WorkingDir: "{app}"; StatusMsg: "Installing dependencies..."; Flags: runhidden
Filename: "{sys}\{#MyAppExeName}"; Parameters: """{app}\scripts\launch.vbs"""; WorkingDir: "{app}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent
