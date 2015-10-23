#MonetDB NodeJS connector v1.0.0

Over here we are working on a renewed version of the MonetDB NodeJS connector. Some of the changes over the previous connector include:
- It will be promise based (with a wrapper for the callback fans, so most of your old code remains usable)
- Reconnect logic will be added, which will be configurable
- Multiple layers of options can be used (global options, connection specific, and query specific options)
- Extended result objects will become available upon request
