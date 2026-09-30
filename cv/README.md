# The `cv/` folder

This folder powers the optional **Custom CV** button in the report, which writes
a tailored copy of your CV per job. Everything real in here is gitignored — only
these example templates are committed. The feature is entirely optional; if you
never press the button, none of these files are needed.

## What goes here

| File | What it is | Committed? |
|------|------------|------------|
| `master-cv.docx` | **Your** CV as a Word document. Required for Custom CV. | No — gitignored |
| `experience-notes.md` | Optional detailed background the tailored summary draws from. | No — gitignored |
| `generated/` | Where each tailored CV is written (`<YourName>_CV_<Company>_<Role>.docx` + PDF). | No — gitignored |
| `master-cv.example.docx` | Template showing the structure `master-cv.docx` must have. | Yes |
| `experience-notes.example.md` | Template for `experience-notes.md`. | Yes |

## Setup

1. Copy `master-cv.example.docx` to `master-cv.docx` and replace its content with
   your real CV — or just drop your own `.docx` in and rename it to
   `master-cv.docx`.
2. Keep the structure the generator expects: a **contact line**, then one or more
   **summary paragraphs** (each a single run of plain text), then an
   **"Experience"** heading. Only the summary paragraphs between the contact line
   and the Experience heading are rewritten per job — everything from "Experience"
   down is left untouched.
3. Optionally copy `experience-notes.example.md` to `experience-notes.md` and fill
   in richer detail (metrics, tools, project stories).
4. Set `CV_NAME_PREFIX` in `config.js` to your name.

> The Custom CV feature also needs an Anthropic API key (it uses Claude to
> rewrite the summary) and exports the PDF via Word/Pages on macOS.
