# Security policy

## Supported versions

Security fixes are made for the latest released version of SnapFrame.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Report it privately through GitHub: open the repository's **Security** tab
and choose **Report a vulnerability**. Include what you found, how to
reproduce it, and the impact you see. You'll get an acknowledgement as soon
as possible, and a fix or mitigation plan once the report is confirmed.

## What is in scope

SnapFrame runs entirely on the user's device and makes no network
requests, so the most relevant issues are:

- anything that lets a web page read, alter or exfiltrate captures, edits or
  settings;
- injected capture scripts (selection overlay, page snapshot) that a page
  could abuse or that leave the page in a changed state;
- redaction that can be bypassed, i.e. original pixels recoverable from an
  exported image;
- permissions that are broader than needed.
