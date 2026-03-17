# SwitchHosts Reorganization — Spec

**Date:** 2026-03-16
**Status:** Ready for implementation

---

## Problem

The current SwitchHosts configuration (102 items across 36 top-level entries) has accumulated
over time without a consistent naming convention. This makes it hard to:

- Quickly identify which child to activate for a given site
- Understand what server/person a child refers to without reading its content
- Know if a child is for production or staging from the title alone

---

## Mental Model (how SwitchHosts is used)

- **Folders** = organizational grouping per site. Never activated directly.
- **Children inside folders** = what gets activated. Each child = one server/person combination,
  optionally scoped to an environment (prod vs staging).
- **Standalone items** (no folder, not a folder) = single-IP sites with no variants. Activated directly.

---

## Naming Convention

### Child items (inside folders)

Format: `[person] [server]` for production, `staging [person] [server]` for staging,
`dev [person] [server]` for dev subdomains (e.g. `dev.elearning.catena.ro`).

| What | Title |
|------|-------|
| Vlad on box2 (10.0.52.232) | `vlad box2` |
| Vlad2 on box2 (10.0.52.242) | `vlad2 box2` |
| Alex on box2 (10.0.52.233) | `alex box2` |
| Denisa on box2 (10.0.52.234) | `denisa box2` |
| Marina on box2 (10.0.52.235) | `marina box2` |
| Marina2 on box2 (10.0.52.245) | `marina2 box2` |
| Silviu on box2 (10.0.52.236) | `silviu box2` |
| Silviu2 on box2 (10.0.52.246) | `silviu2 box2` |
| Nicu on box2 (10.0.52.237) | `nicu box2` |
| Catalin on box2 (10.0.52.238) | `catalin box2` |
| QA on box2 (10.0.52.240) | `qa box2` |
| VPS principal (178.162.221.169) | `vps` |
| VPS2 (89.46.103.27) | `vps2` |
| Staging on box2 (Vlad) | `staging vlad box2` |
| Staging on vps2 | `staging vps2` |
| Dev subdomain on box2 (Vlad) | `dev vlad box2` |
| Other unique external IP | IP address as-is, e.g. `146.70.110.66` |

### Folder items

- Named after the primary domain, lowercase, e.g. `catena.ro`, `tonica.ro`
- No typos, no suffixes (e.g. `harta-romania.playmore.ro` not `harta-romania.playmore.ro1`)
- Capital first letter only when it's a brand name (e.g. `Adoramami.ro` → lowercase `adoramami.ro`)

### Standalone items

- Named after the domain they redirect, e.g. `anm.playmore.ro`
- When two standalones are related (same site, e.g. `elearning.catena.ro` + `dev.elearning.catena.ro`),
  they are grouped into a folder

---

## Rules for Children

1. **One child per server/person per environment** — no duplicates
2. **No empty children** — children with no content are deleted
3. **No `altele` children** unless they have actual content; if they do, they get a descriptive name
4. **No generic names** like `toate diverse` — content must be split into named children
5. **Staging children** are separate from production children (different title, different content)

---

## Current State → Target State

### Standalones (top-level, no folder)

| Current | Action | Target |
|---------|--------|--------|
| `ALL` (empty, off) | Delete | — |
| `ads.tonica.ro` (empty, off) | Delete | — |
| `filnetapi.catena.ro` (empty, off) | Delete | — |
| `api1.farmaciata.ro` (off) | Keep as standalone | `api1.farmaciata.ro` |
| `anm.playmore.ro` (off) | Keep as standalone | `anm.playmore.ro` |
| `box2.playmore.ro` (off) | Keep as standalone | `box2.playmore.ro` |
| `catenaracingteam.ro` (off) | Keep as standalone | `catenaracingteam.ro` |
| `fildas.ro` (off) | Keep as standalone | `fildas.ro` |
| `elearning.catena.ro` (off) | Group with dev variant | folder `elearning.catena.ro` → children `vlad box2` (prod), `dev vlad box2` |
| `dev.elearning.catena.ro` (ON) | Move into folder above | see above |
| `wordpress.box2.playmore.ro` (ON) | Keep as standalone | `wordpress.box2.playmore.ro` |

### Folders

#### adoramami.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `89.46.103.27` | Rename | `vps2` |
| `10.0.52.232` | Rename | `vlad box2` |
| `10.0.52.235` | Rename | `marina box2` |
| `89.46.103.26` (empty) | Delete | — |

#### ancavlad.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `89.46.103.27` | Rename | `vps2` |
| `178.162.221.169` (empty) | Delete | — |
| `staging.ancavlad.ro 232` | Rename | `staging vlad box2` |
| `staging 89.46.103.27` (empty) | Delete | — |

#### agilcurier.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `178.162.221.169` | Rename | `vps` |

#### catena.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `altele` | Rename (content = marina box2 IP) | `marina box2` |

#### cava-bucharest.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `cava-bucharest.ro` | Rename (content = vlad box2 → prod) | `vlad box2` |
| `staging.cava-bucharest.ro` | Rename (content = vlad box2 → staging) | `staging vlad box2` |

#### catenapascupas.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `catenapascupas.ro 146.70.110.66` | Rename | `146.70.110.66` |
| `10.0.52.232` | Rename | `vlad box2` |
| `10.0.52.235-marina` | Rename | `marina box2` |
| `altele` | Merge content into existing `vlad box2` child (both are 10.0.52.232 — API subdomains) | *(merged, delete after)* |

#### cariere.fildascatena.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `10.0.52.233` | Rename | `alex box2` |

#### consenttonica.catena.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `altele` | Rename (content = vlad box2 + uat/fat subdomains) | `vlad box2` |

#### farmaciata.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `10.0.52.237` | Rename | `nicu box2` |
| `altele` (empty) | Delete | — |

#### focusmed.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `89.46.103.27 staging` | Rename (content = staging.focus-clinics.ro) | `staging vps2` |

#### galeriasenso.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `89.46.103.27` | Rename | `vps2` |
| `178.162.221.169` | Rename | `vps` |
| `10.0.52.232` | Rename | `vlad box2` |

#### harta-romania.playmore.ro *(rename folder from `harta-romania.playmore.ro1`)*
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `89.46.103.27` | Rename | `vps2` |

#### naturalis.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename (content includes staging.naturalis.ro too) | `vlad box2` |
| `altele` | Rename (content = marina box2) | `marina box2` |

#### piarom.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |

#### playmore.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `89.46.103.27` | Rename | `vps2` |

#### passwords.tonicagroup.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `46.165.219.167` | Keep as-is (unique IP, not box2/vps/vps2) | `46.165.219.167` |
| `10.0.52.232` | Rename | `vlad box2` |
| `altele` (empty) | Delete | — |

#### rilastil.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `89.46.103.27` | Rename | `vps2` |
| `10.0.52.232-staging` | Rename | `staging vlad box2` |

#### revistagalenus.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `178.162.221.169` | Rename | `vps` |
| `altele` (empty) | Delete | — |

#### safeforyou.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `10.0.52.234` | Rename | `denisa box2` |
| `178.162.221.169` | Rename | `vps` |

#### sensotv.ro
The single child `toate diverse` (ON) contains multiple commented-out server lines.
Split into individual children, keeping only the active (uncommented) line enabled:

| Current child | Action | New title | Content |
|--------------|--------|-----------|---------|
| `toate diverse` (ON) | Replace with 4 separate children | — | — |
| *(new)* | Create (ON — inherits current active state) | `vlad box2` | `10.0.52.232 sensotv.ro www.sensotv.ro www.sensosanatate.ro www.sensolifestyle.ro www.sensoarte.ro www.sensoarta.ro sensosanatate.ro sensolifestyle.ro sensoarte.ro sensoarta.ro` |
| *(new)* | Create (off) | `alex box2` | `10.0.52.233 sensotv.ro ...` (same domains) |
| *(new)* | Create (off) | `vps2` | `89.46.103.27 sensotv.ro ...` (same domains + staging subdomains) |
| *(new)* | Create (off) | `94.130.169.181` | `94.130.169.181 sensotv.ro ...` (same domains) |

Note: The commented `cdn.sensotv.ro` and `vps.sensotv.ro` lines are historical noise — omit them.

#### slabsaugras.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `10.0.52.235` | Rename | `marina box2` |
| `altele` | Rename (content = vps) | `vps` |

#### springfarma.com
| Current child | Action | New title |
|--------------|--------|-----------|
| `spring 146.70.110.66` | Rename | `146.70.110.66` |
| `185.123.142.197` | Keep as-is (unique IP) | `185.123.142.197` |
| `10.0.52.232` (empty, off) | Delete | — |
| `admin.springfarma.com` (ON) | Keep (specific subdomain redirect) | `admin.springfarma.com` |
| `altele` (empty, ON) | Delete — empty content, ON state is meaningless | — |

#### tonica.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `10.0.52.232 staging` | Rename | `staging vlad box2` |
| `10.0.52.235` | Rename | `marina box2` |
| `10.0.52.233` | Rename | `alex box2` |
| `altele` | Rename (content = vps) | `vps` |

#### vladalexandru.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |
| `89.46.103.27` | Rename | `vps2` |

#### video.playmore.ro
| Current child | Action | New title |
|--------------|--------|-----------|
| `10.0.52.232` | Rename | `vlad box2` |

---

## IP → Person Mapping (box2)

| IP | Person | Title prefix |
|----|--------|-------------|
| 10.0.52.232 | vlad | `vlad box2` |
| 10.0.52.233 | alex | `alex box2` |
| 10.0.52.234 | denisa | `denisa box2` |
| 10.0.52.235 | marina | `marina box2` |
| 10.0.52.236 | silviu | `silviu box2` |
| 10.0.52.237 | nicu | `nicu box2` |
| 10.0.52.238 | catalin | `catalin box2` |
| 10.0.52.240 | qa | `qa box2` |
| 10.0.52.242 | vlad2 | `vlad2 box2` |
| 10.0.52.245 | marina2 | `marina2 box2` |
| 10.0.52.246 | silviu2 | `silviu2 box2` |
| 46.165.219.167 | — | External VPS (Passbolt) — keep as IP |

---

## Summary of Changes

| Change type | Count |
|-------------|-------|
| Standalones to delete (empty) | 3 (`ALL`, `ads.tonica.ro`, `filnetapi.catena.ro`) |
| Children to delete (empty/unused) | 11 (adoramami×1, ancavlad×2, farmaciata×1, passwords×1, revistagalenus×1, springfarma×2, passwords×1, sensotv×1 replaced, catena altele×0) |
| Children to rename | ~52 |
| Folders to rename | 2 (`harta-romania.playmore.ro1` → `harta-romania.playmore.ro`, `Adoramami.ro` → `adoramami.ro`) |
| New folder to create | 1 (`elearning.catena.ro`) |
| Items to move into folder | 2 (`elearning.catena.ro`, `dev.elearning.catena.ro`) |
| `sensotv.ro/toate diverse` to replace with 4 children | 1 |

---

## Out of Scope

- Changing hosts content (IPs or domains inside each child) — only titles and structure change
- Adding new sites
- Changing which items are currently ON/OFF (except deleting empty ON items)
