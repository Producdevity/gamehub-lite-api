# Troubleshooting

## Logs

Logs are required for bugs involving installs, downloads, game launch, crashes, Wine, drivers, or container behavior.

Find the package name for the GameHub Lite APK you installed. Do not assume `com.xiaoji.egggame`; benchmark and renamed builds can use different package names.

Open this directory in a file manager:

```text
/storage/emulated/0/Android/data/<package-name>/files/log/
```

Attach these two files when they exist:

```text
util_YYYY_MM_DD_<package-name>.txt
util_YYYY_MM_DD_<package-name>_wine.txt
```

Use the logs from the failed run. If you are not sure which files are correct:

1. Delete the old files in the log directory.
2. Start the game or install again.
3. Reproduce the issue.
4. Go back to the log directory.
5. Attach the newly created files.

Also include the container settings you used and what you already tried.
