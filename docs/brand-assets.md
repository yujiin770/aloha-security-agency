# Brand assets

What the public site expects in `public/`, and what happens when a file isn't
there yet.

---

## How missing images behave

Every photograph on the marketing site renders through `SmartImage`
(`src/components/marketing/SmartImage.tsx`). If a file is missing, it falls back
to a branded dark panel of exactly the same dimensions — so the layout is final
from day one, nothing shows a broken-image icon, and dropping a real photo in
needs **no code change**.

In development the fallback also prints the path it was looking for, which is
the quickest way to see what is still outstanding.

---

## Logo

| File | Used by | Status |
|---|---|---|
| `public/logo.png` | Header, footer, image fallbacks | **Present — 2.42 MB** |
| `public/logo.svg` | Favicon | Placeholder mark |

> **`logo.png` needs compressing before launch.** At 2.42 MB it is by a wide
> margin the heaviest thing on the page, and it loads in the header on every
> route. Target **under 60 KB**. Any of these will do it:
>
> - [Squoosh](https://squoosh.app) — drag in, export PNG at ~400 px wide
> - `npx @squoosh/cli --resize '{"width":400}' --oxipng auto public/logo.png`
> - Export a `logo.webp` alongside it for a further saving
>
> Replace the file in place, keeping the name — every reference points at
> `/logo.png`.

`public/logo.svg` is still the placeholder shield generated during the build.
Replacing it with a proper vector of the real mark would let the header render
crisply at any size and cut the header payload to near nothing.

---

## Photography

**The normal way to add photography is the admin console:
Website Content → Images** (`/admin/content/media`). Each slot is a named
position with a fixed crop; upload an image and it appears on the site
immediately. No deploy, no filenames to remember.

The table below is the fallback path — files placed in `public/images/` are used
when a slot has no upload. Useful for seeding a fresh install, but the CMS is
the intended route.

| Slot key | Fallback file | Size |
|---|---|---|
| `hero` | `public/images/hero.jpg` | 1920×1080 |
| `about` | `public/images/about.jpg` | 1200×900 |
| `team` | `public/images/team.jpg` | 900×1200 |
| `training` | `public/images/training.jpg` | 1200×800 |
| `service_guarding` | `public/images/service_guarding.jpg` | 800×600 |
| `service_cctv` | `public/images/service_cctv.jpg` | 800×600 |
| `service_escort` | `public/images/service_escort.jpg` | 800×600 |
| `cta_bg` | `public/images/cta_bg.jpg` | 1920×800 |

Art direction for each slot is written into the admin UI itself, so whoever
uploads sees it at the moment they need it.

### Original static reference

Filenames if you take the `public/images/` route.

| File | Size | Where it appears | Art direction |
|---|---|---|---|
| `hero.jpg` | 1920×1080 | Landing hero (full-bleed, dark overlay) | Officers on post or an operations floor. Leave the **left third uncluttered** — the headline sits there. Shot slightly dark works best. |
| `about.jpg` | 1200×900 | "Who we are", About page hero | Team or office. Faces welcome, professional and unposed. |
| `team.jpg` | 900×1200 | About page (**portrait**) | Personnel at a client site. Vertical crop. |
| `training.jpg` | 1200×800 | "How to join", Careers hero | Pre-deployment or refresher training in progress. |
| `service-guarding.jpg` | 800×600 | Services hero | Uniformed officer at a static post. |
| `service-cctv.jpg` | 800×600 | Services "how we engage" | Command centre, monitors visible. |
| `service-escort.jpg` | 800×600 | Reserved for the services grid | Close-in protection detail. |
| `cta-bg.jpg` | 1920×800 | Closing CTA band | Low-detail, wide, dark-friendly — it sits under an 88% ink overlay, so anything busy turns to mud. |

### Before you export

- **JPEG at quality 75–82.** These are photographs; PNG will be five times the
  size for no visible gain.
- **Keep each file under ~300 KB.** `hero.jpg` is the one that matters most —
  it is the Largest Contentful Paint element.
- **Real photographs of your own people and sites** beat stock every time.
  Visitors can tell, and a stock guard undercuts the trust the page is built to
  establish.
- **Get consent** before publishing recognisable faces of staff or applicants.
- WebP is supported if you prefer it — rename the references in the components,
  or ship both and add a `<picture>` element.

### Content Security Policy

`img-src` is `'self' data: blob: https://*.supabase.co`, so **external image
CDNs are blocked**. Images must be served from `public/`, inlined as data URIs,
or uploaded to Supabase Storage. This is deliberate on a site that handles
applicant personal data — please don't widen it just to hotlink stock.

---

## Company statistics

The "By the numbers" band reads its figures from `settings` rows, not from code.
Until they are set it says so plainly rather than displaying invented numbers.

Set these in the admin console under **Settings**:

| Key | Meaning |
|---|---|
| `marketing.stat.personnel` | Security personnel deployed |
| `marketing.stat.clients` | Client sites protected |
| `marketing.stat.posts` | Active posts nationwide |
| `marketing.stat.years` | Years in operation |

Any key left unset is simply omitted from the row. Set all four, or none.

---

## Content still to supply

Four sections on the landing page render a "content needed" panel until someone
publishes real content. Each is managed in the admin console — no code changes:

| Section | Where to add it | Needs |
|---|---|---|
| Client logo strip | **Website Content → Clients** | Real client marks — **with permission to display them** |
| Testimonials | **Website Content → Testimonials** | Quotes with name, role and company, given willingly |
| Accreditations | **Website Content → Accreditations** | Genuine PNP-SOSIA licence number, DOLE registration, SEC/DTI, PADPAO membership |
| News | **Website Content → News** | Announcements, recruitment drives, milestones |

Nothing is published until you tick **Published** on the item. That flag is a
real access boundary: Row Level Security refuses unpublished rows to anonymous
visitors, so a draft is genuinely private rather than merely hidden by the UI.

The empty states are deliberate. A visitor cannot tell invented praise from
earned praise, and an unearned credential is a serious thing to publish — so the
site says nothing rather than something untrue.
