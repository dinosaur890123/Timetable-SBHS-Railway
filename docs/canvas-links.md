# Canvas links

Students link each class to its Canvas course, and the class name then opens Canvas
from the timetable and home page. Classmates share Canvas course links with each
other, so most students never have to paste one.

## Setup

Nothing to configure. The defaults suit SBHS:

- Tables are created on server start from `server/sql/schema.sql`, like the rest of
  the schema. Existing personal links are migrated in place.
- Without a database, the server keeps everything in memory (local development only).

Optional environment variables on the server:

| Variable | Default | What it does |
| --- | --- | --- |
| `CANVAS_HOST` | `sydneyboyshigh.instructure.com` | The school's Canvas. Only course links on this host (or the aliases below) are shared, and bare course numbers become links here. |
| `CANVAS_ALIAS_HOSTS` | (none) | Comma-separated hosts that serve the same courses, e.g. `canvas.sbhs.net.au`. Links on them are rewritten to `CANVAS_HOST`. |
| `WELLIO_HOST` | `app.wellioeducation.com` | Wellio hosts some classes instead of Canvas. `…/schools/<id>` links are shared too and kept as pasted. |
| `CANVAS_LINK_CONFIRMATIONS` | `2` | Students who must back a link (the one who shared it counts) before the whole class gets it. |
| `CANVAS_LINK_REJECTIONS` | `3` | Reports that hide a link, once they match or outnumber its backers. |
| `CANVAS_LINK_DAILY_SUGGESTIONS` | `10` | New shared links one student can create per day. |

## How it works

**Personal links** (`canvas_links`) are private, one per class per school year, and
keyed by the class's short title (`Ma1`). Any web link is allowed. They're saved one
class at a time, so saving one class never touches another. The app keeps a read-only
copy on the device for offline use; that copy is never written back to the server.

Everything resets each calendar year (Sydney time): on boot and daily, the server
deletes personal and shared links from earlier school years, so students re-enter
their links and classes vote again. The Settings red dot on Canvas links comes back
until a student has saved at least one link.

**Shared links** (`canvas_class_links`, `canvas_class_link_votes`) are keyed by year
group and class (`9Ma1`) within a school year. Short titles repeat across year groups,
and courses change each year. When a student saves a link to a course on
`CANVAS_HOST` or a school page on `WELLIO_HOST`, it's shared with their class as
their vote for it. Classmates are asked
once whether it's right ("Yes, use it" / "Wrong link" / "Not now", which hides it for
a week). A student's class uses the link with the most net backing that has reached
`CANVAS_LINK_CONFIRMATIONS` backers. Their own link always takes priority.

## Abuse protections

- **Class membership is checked server-side.** Before accepting a shared link or a
  vote, the server reads the student's own SBHS timetable using their sign-in token
  (cached for 6 hours). Students can only affect classes they're actually in.
- **Only Canvas and Wellio course links are shared**, stored as a course number
  or Wellio path and rebuilt as `https://CANVAS_HOST/courses/<n>` or
  `https://WELLIO_HOST/schools/<id>`. A shared link can't point anywhere else.
- **One vote per student.** Votes are one row per student and counts are worked out
  on read, so repeated clicks don't stack and concurrent votes can't be lost. Backing
  a link drops the student's backing of the class's other links.
- **Blacklisted students** can't share or vote, and their existing votes and
  suggestions stop counting straight away.
- **Rate limits.** 30 changes a minute and 40 votes an hour per student, plus the
  daily cap on new shared links.
- **Admin override.** Admin → Canvas Links lists every shared link with its votes.
  Admins can pin a link as the class's link, hide it, hand it back to the votes, or
  delete it.

The tables `canvas_courses`, `canvas_course_reports` and `canvas_link_suggestions` are
from an earlier design and are no longer used. They're left in place so no data is
dropped automatically. Drop them by hand once you're happy.

## API

All routes need the student's SBHS bearer token.

| Route | |
| --- | --- |
| `GET /api/canvas-links` | The student's links this school year, plus `canvasHost`. |
| `PUT /api/canvas-links/:className` | `{ url, classKey? }`. Saves one link; with `classKey`, shares a Canvas course link. |
| `DELETE /api/canvas-links/:className` | Removes one link. |
| `DELETE /api/canvas-links` | Removes all of the student's links for this school year. |
| `POST /api/canvas-links/import` | `{ links: { className: url } }`. Adds links for classes without one; never replaces. |
| `GET /api/canvas-links/community` | Shared links for the student's classes: `{ classes: { [classKey]: { link, suggestions } } }`. |
| `POST /api/canvas-links/community/:id/vote` | `{ vote: 1 \| -1 \| 0 }`: correct, wrong, or clear. |
| `GET /api/admin/canvas-links/community` | Admin: every shared link this year, with votes. |
| `PUT /api/admin/canvas-links/community/:id` | Admin: `{ lockedStatus: 'verified' \| 'rejected' \| null }`. |
| `POST /api/admin/canvas-links/community/:id/reset-reports` | Admin: clears every report on a link; backers are kept. |
| `DELETE /api/admin/canvas-links/community/:id` | Admin: deletes a shared link and its votes. |
