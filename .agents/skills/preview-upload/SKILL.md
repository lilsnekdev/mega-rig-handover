---
name: preview-upload
description: Put a page copy on the public preview link with gh and GitHub Pages, then take the lane marker off once reviewed. Use when a plan ends in a review (ADR 0003).
---

# preview-upload

A preview is a static copy of one page on a public HTTPS link, so a reviewer without lane
access can read it. The bucket repo is separate from this one: previews never live in this
repo (ADR 0003).

## Steps

1. Run rig locally (`pnpm start`) and save the page with a command, not a browser's
   "save as": `curl -s http://localhost:<PORT>/digest/<night> -o preview.html`.
   The page is self-contained; one HTML file, lane banner included (ADR 0001).
2. Check the file before it leaves: no `<script src>`, no external `<link>`, and the lane
   marker present in the banner.
3. Push the file as `index.html` to the bucket repo (default: `<owner>/mega-rig-preview`,
   branch `main`). The local clone may name its branch `master`: push with
   `git push origin HEAD:main`. GitHub Pages serves it at the bucket's pages URL.
4. Verify from outside before sending: `curl` the public HTTPS link until it answers
   200 and contains the marker. Uploaded is not reachable — check the link the way the
   reviewer will open it.
5. Note the link on the plan's preview issue, and **keep that issue open until the reviewer
   has looked**: the reviewer's queue is the open issues.
6. Once the review is in, save the page again with `LANE_MARKER` unset (the banner reads
   "no marker set") and upload it over the same link. Verify the public link shows no
   marker. Ask the human before this upload.
7. Never commit a preview, `.env` or tokens to this repo (ADR 0003).

## Don'ts

- Don't send a link that was not fetched from outside first.
- Don't take the marker off before the reviewer has looked.
- Don't park the preview in this repo, in issues, or in chat attachments.
