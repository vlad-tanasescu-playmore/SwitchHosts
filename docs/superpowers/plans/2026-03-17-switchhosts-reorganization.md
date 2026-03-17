# SwitchHosts Reorganization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename all SwitchHosts items to a consistent `[person] [server]` naming convention, delete empty items, fix folder names, and reorganize two standalone items into a folder.

**Architecture:** All changes go through the SwitchHosts HTTP API (port 50761). Each operation is a simple curl call: `PUT /api/items/:id` to rename, `DELETE /api/items/:id` to delete, `POST /api/items` to create, `PUT /api/content/:id` to set content. No code changes needed — this is pure data reorganization.

**Tech Stack:** SwitchHosts HTTP API (localhost:50761), curl, bash

---

## Prerequisites

Before starting, verify SwitchHosts is running and the HTTP API is enabled:

```bash
curl -s http://127.0.0.1:50761/
# Expected: Hello SwitchHosts!
```

If this fails: open SwitchHosts → Preferences → enable HTTP API → OK.

---

## Chunk 1: Delete empty standalones and children

### Task 1: Delete empty top-level standalones

These three items are empty and unused.

**Files:** none (API only)

- [ ] **Step 1: Delete `ALL`**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/e856fae6-9ff8-4849-9819-90b76e7bb384
# Expected: {"success":true}
```

- [ ] **Step 2: Delete `ads.tonica.ro`**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/c8723c52-06b4-4a81-9b86-a9e1f1ec2b1e
# Expected: {"success":true}
```

> Note: IDs starting with `c8723c52` — get exact ID if needed:
> `curl -s "http://127.0.0.1:50761/api/list?q=ads.tonica.ro" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).data.map(i=>i.id+' '+i.title).join('\n')))"`

- [ ] **Step 3: Delete `filnetapi.catena.ro`**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/293e6b77-b68f-4d58-a24d-53ece3cb7e07
# Expected: {"success":true}
```

- [ ] **Step 4: Verify — these three titles no longer appear in the list**

```bash
curl -s "http://127.0.0.1:50761/api/list?q=ALL" | node -e "process.stdin.resume();let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const r=JSON.parse(d);console.log('count:',r.data.length)})"
# Expected: count: 0 (or only unrelated results)
```

- [ ] **Step 5: Commit**

```bash
# Nothing to commit — API-only changes. Skip git commit for this step.
# (SwitchHosts stores data in its own database, not in this repo)
```

---

### Task 2: Delete empty children inside folders

Each of these children has no content and serves no purpose.

- [ ] **Step 1: Delete `adoramami.ro / 89.46.103.26` (empty)**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/67c34600-2e4a-4b3e-9b22-1cd4f71e2a5d
# Expected: {"success":true}
```

- [ ] **Step 2: Delete `ancavlad.ro / 178.162.221.169` (empty)**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/47a9500b-6b5d-4e68-b123-38ead1c77f21
# Expected: {"success":true}
```

- [ ] **Step 3: Delete `ancavlad.ro / staging 89.46.103.27` (empty)**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/eb3bbaff-1234-5678-abcd-000000000000
# Expected: {"success":true}
```

- [ ] **Step 4: Delete `farmaciata.ro / altele` (empty)**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/b58a2324-0000-0000-0000-000000000000
# Expected: {"success":true}
```

- [ ] **Step 5: Delete `passwords.tonicagroup.ro / altele` (empty)**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/113c1355-0000-0000-0000-000000000000
# Expected: {"success":true}
```

- [ ] **Step 6: Delete `revistagalenus.ro / altele` (empty)**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/605d294b-0000-0000-0000-000000000000
# Expected: {"success":true}
```

- [ ] **Step 7: Delete `springfarma.com / 10.0.52.232` (empty, off)**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/89bed502-0000-0000-0000-000000000000
# Expected: {"success":true}
```

- [ ] **Step 8: Delete `springfarma.com / altele` (empty, ON)**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/801011ca-0000-0000-0000-000000000000
# Expected: {"success":true}
```

> **Note on IDs:** The IDs above use the first 8 hex chars from the inventory. Use this helper to get the full ID for any item by title if needed:
> ```bash
> FOLDER_ID="581143f3-..."   # springfarma.com folder ID
> curl -s "http://127.0.0.1:50761/api/list" | node -e "
> process.stdin.resume();let d='';
> process.stdin.on('data',c=>d+=c);
> process.stdin.on('end',()=>{
>   JSON.parse(d).data.filter(i=>i.parent_id&&i.parent_id.startsWith('581143f3'))
>     .forEach(i=>console.log(i.id, i.title, 'on='+i.on));
> })"
> ```

- [ ] **Step 9: Verify all target folders have no empty children**

```bash
curl -s "http://127.0.0.1:50761/api/list?include_content=true" > /tmp/verify1.json
node -e "
const fs=require('fs');
const items=JSON.parse(fs.readFileSync('/tmp/verify1.json','utf8')).data;
const empty=items.filter(i=>i.parent_id&&!(i.content||'').trim());
console.log('Remaining empty children:',empty.length);
empty.forEach(i=>console.log(' -',i.title,'in',i.parent_id.substring(0,8)));
"
# Expected: 0 empty children (or only items you haven't processed yet)
```

---

## Chunk 2: Rename folder names

### Task 3: Fix folder titles

Two folders have incorrect titles.

- [ ] **Step 1: Rename `Adoramami.ro` → `adoramami.ro`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/b8601942-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "adoramami.ro"}'
# Expected: {"success":true,"data":{...,"title":"adoramami.ro",...}}
```

- [ ] **Step 2: Rename `harta-romania.playmore.ro1` → `harta-romania.playmore.ro`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/b248d712-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "harta-romania.playmore.ro"}'
# Expected: {"success":true,"data":{...,"title":"harta-romania.playmore.ro",...}}
```

- [ ] **Step 3: Verify**

```bash
curl -s "http://127.0.0.1:50761/api/list?type=folder" | node -e "
process.stdin.resume();let d='';
process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  JSON.parse(d).data.forEach(i=>console.log(i.title));
})"
# Expected: adoramami.ro (not Adoramami.ro), harta-romania.playmore.ro (not harta-romania.playmore.ro1)
```

---

## Chunk 3: Rename children — batch A (adoramami through catena)

### Task 4: Rename adoramami.ro children

- [ ] **Step 1: `89.46.103.27` → `vps2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/e1977b56-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps2"}'
```

- [ ] **Step 2: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/6ffbbc86-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 3: `10.0.52.235` → `marina box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/11a659c3-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "marina box2"}'
```

### Task 5: Rename ancavlad.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/ed89ce4b-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `89.46.103.27` → `vps2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/33fd3fbd-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps2"}'
```

- [ ] **Step 3: `staging.ancavlad.ro 232` → `staging vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/99703872-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "staging vlad box2"}'
```

### Task 6: Rename agilcurier.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/6402f820-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `178.162.221.169` → `vps`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/7a7335a3-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps"}'
```

### Task 7: Rename catena.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/baa086c4-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `altele` → `marina box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/93414465-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "marina box2"}'
```

### Task 8: Rename cava-bucharest.ro children

- [ ] **Step 1: `cava-bucharest.ro` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/8509d8a3-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `staging.cava-bucharest.ro` → `staging vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/133ab3f6-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "staging vlad box2"}'
```

---

## Chunk 4: Rename children — batch B (catenapascupas through galeriasenso)

### Task 9: Reorganize catenapascupas.ro children

The `altele` child contains API subdomain entries for the same server as `10.0.52.232`. Merge its content into `vlad box2`, then delete `altele`.

- [ ] **Step 1: Rename `catenapascupas.ro 146.70.110.66` → `146.70.110.66`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/f243a2cb-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "146.70.110.66"}'
```

- [ ] **Step 2: Rename `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/9fdc65c3-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 3: Set merged content on `vlad box2`**

The merged content combines the main domains (from `10.0.52.232`) and the active API subdomain lines (from `altele`), keeping the commented historical lines from `altele` as-is:

```bash
curl -s -X PUT http://127.0.0.1:50761/api/content/9fdc65c3-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d "{\"content\": \"10.0.52.232\tcatenapascupas.ro www.catenapascupas.ro\n10.0.52.232\tapi.catenapascupas.ro\n#89.46.103.27\tapi.staging-fat.catenapascupas.ro\n10.0.52.232\tapi.staging-fat.catenapascupas.ro\n10.0.52.232\tapi.staging-uat.catenapascupas.ro\n\"}"
```

- [ ] **Step 4: Verify the content was written correctly**

```bash
curl -s "http://127.0.0.1:50761/api/content/9fdc65c3-0000-0000-0000-000000000000"
# Expected: {"success":true,"data":{"id":"...","content":"10.0.52.232\tcatenapascupas.ro www.catenapascupas.ro\n10.0.52.232\tapi.catenapascupas.ro\n..."}}
```

- [ ] **Step 5: Rename `10.0.52.235-marina` → `marina box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/f16a9cc0-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "marina box2"}'
```

- [ ] **Step 6: Delete `altele` (now merged)**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/e376643b-0000-0000-0000-000000000000
# Expected: {"success":true}
```

### Task 10: Rename cariere.fildascatena.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/ef62fdd3-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `10.0.52.233` → `alex box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/6ae82210-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "alex box2"}'
```

### Task 11: Rename consenttonica.catena.ro children

- [ ] **Step 1: `altele` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/9a996906-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

### Task 12: Rename farmaciata.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/e350207b-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `10.0.52.237` → `nicu box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/53c87df0-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "nicu box2"}'
```

### Task 13: Rename focusmed.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/2790e486-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `89.46.103.27 staging` → `staging vps2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/1e747996-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "staging vps2"}'
```

### Task 14: Rename galeriasenso.ro children

- [ ] **Step 1: `89.46.103.27` → `vps2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/3f25d290-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps2"}'
```

- [ ] **Step 2: `178.162.221.169` → `vps`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/c1c77242-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps"}'
```

- [ ] **Step 3: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/649751ed-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

---

## Chunk 5: Rename children — batch C (harta through rilastil)

### Task 15: Rename harta-romania.playmore.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/ee5514e1-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `89.46.103.27` → `vps2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/e63be03e-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps2"}'
```

### Task 16: Rename naturalis.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/b48c31a2-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `altele` → `marina box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/e1085fe5-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "marina box2"}'
```

### Task 17: Rename piarom.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/6398c285-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

### Task 18: Rename playmore.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/5d6113e1-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `89.46.103.27` → `vps2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/387a9afb-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps2"}'
```

### Task 19: Rename passwords.tonicagroup.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/37b1dc46-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

### Task 20: Rename rilastil.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/67cc3c1b-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `89.46.103.27` → `vps2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/f08dc6cd-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps2"}'
```

- [ ] **Step 3: `10.0.52.232-staging` → `staging vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/4f077617-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "staging vlad box2"}'
```

---

## Chunk 6: Rename children — batch D (revistagalenus through video)

### Task 21: Rename revistagalenus.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/a7bb69f8-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `178.162.221.169` → `vps`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/93287942-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps"}'
```

### Task 22: Rename safeforyou.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/84a453b0-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `10.0.52.234` → `denisa box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/232df82c-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "denisa box2"}'
```

- [ ] **Step 3: `178.162.221.169` → `vps`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/81323d52-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps"}'
```

### Task 23: Replace sensotv.ro/toate diverse with 4 children

The `sensotv.ro` folder has one child `toate diverse` (ON) with all server variants mixed as commented-out lines. We replace it with 4 clean children. All 4 children must be created **inside the `sensotv.ro` folder using the SwitchHosts UI** — the HTTP API `POST /api/items` only creates root-level items and cannot target a folder. After creating them via UI, we set their content via API, then delete the original `toate diverse`.

**Full content strings** (extracted from current `toate diverse`):

| New title | IP | Content |
|-----------|-----|---------|
| `vlad box2` | 10.0.52.232 | `10.0.52.232\tsensotv.ro www.sensotv.ro www.sensosanatate.ro www.sensolifestyle.ro www.sensoarte.ro www.sensoarta.ro sensosanatate.ro sensolifestyle.ro sensoarte.ro sensoarta.ro` |
| `alex box2` | 10.0.52.233 | `10.0.52.233\tsensotv.ro www.sensotv.ro www.sensosanatate.ro www.sensolifestyle.ro www.sensoarte.ro www.sensoarta.ro sensosanatate.ro sensolifestyle.ro sensoarte.ro sensoarta.ro` |
| `vps2` | 89.46.103.27 | `89.46.103.27\tsensotv.ro www.sensotv.ro www.sensosanatate.ro www.sensolifestyle.ro www.sensoarte.ro www.sensoarta.ro sensosanatate.ro sensolifestyle.ro sensoarte.ro sensoarta.ro\n89.46.103.27\tstaging.sensotv.ro staging.sensosanatate.ro staging.sensolifestyle.ro staging.sensoarte.ro staging.sensoarta.ro` |
| `94.130.169.181` | 94.130.169.181 | `94.130.169.181\tsensotv.ro www.sensotv.ro www.sensosanatate.ro www.sensolifestyle.ro www.sensoarte.ro www.sensoarta.ro sensosanatate.ro sensolifestyle.ro sensoarte.ro sensoarta.ro` |

- [ ] **Step 1: In SwitchHosts UI, create 4 new local items inside the `sensotv.ro` folder**

Right-click on `sensotv.ro` folder → New item (repeat 4 times):
- `vlad box2` — enabled (ON)
- `alex box2` — disabled
- `vps2` — disabled
- `94.130.169.181` — disabled

Do not set content yet — we'll do that via API.

- [ ] **Step 2: Get the IDs of the newly created children**

```bash
curl -s "http://127.0.0.1:50761/api/list" | node -e "
const fs=require('fs');
let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  const items=JSON.parse(d).data;
  const sensotv=items.find(i=>i.title==='sensotv.ro');
  const children=items.filter(i=>i.parent_id===sensotv.id);
  children.forEach(c=>console.log(c.id, c.title, 'on='+c.on));
})
"
# Note the IDs — you'll use them in the next steps
```

- [ ] **Step 3: Set content for `vlad box2`**

```bash
# Replace VLAD_ID with the id from Step 2
curl -s -X PUT "http://127.0.0.1:50761/api/content/VLAD_ID" \
  -H "Content-Type: application/json" \
  -d '{"content": "10.0.52.232\tsensotv.ro www.sensotv.ro www.sensosanatate.ro www.sensolifestyle.ro www.sensoarte.ro www.sensoarta.ro sensosanatate.ro sensolifestyle.ro sensoarte.ro sensoarta.ro\n"}'
```

- [ ] **Step 4: Set content for `alex box2`**

```bash
curl -s -X PUT "http://127.0.0.1:50761/api/content/ALEX_ID" \
  -H "Content-Type: application/json" \
  -d '{"content": "10.0.52.233\tsensotv.ro www.sensotv.ro www.sensosanatate.ro www.sensolifestyle.ro www.sensoarte.ro www.sensoarta.ro sensosanatate.ro sensolifestyle.ro sensoarte.ro sensoarta.ro\n"}'
```

- [ ] **Step 5: Set content for `vps2`**

```bash
curl -s -X PUT "http://127.0.0.1:50761/api/content/VPS2_ID" \
  -H "Content-Type: application/json" \
  -d '{"content": "89.46.103.27\tsensotv.ro www.sensotv.ro www.sensosanatate.ro www.sensolifestyle.ro www.sensoarte.ro www.sensoarta.ro sensosanatate.ro sensolifestyle.ro sensoarte.ro sensoarta.ro\n89.46.103.27\tstaging.sensotv.ro staging.sensosanatate.ro staging.sensolifestyle.ro staging.sensoarte.ro staging.sensoarta.ro\n"}'
```

- [ ] **Step 6: Set content for `94.130.169.181`**

```bash
curl -s -X PUT "http://127.0.0.1:50761/api/content/IP_ID" \
  -H "Content-Type: application/json" \
  -d '{"content": "94.130.169.181\tsensotv.ro www.sensotv.ro www.sensosanatate.ro www.sensolifestyle.ro www.sensoarte.ro www.sensoarta.ro sensosanatate.ro sensolifestyle.ro sensoarte.ro sensoarta.ro\n"}'
```

- [ ] **Step 7: Verify all 4 children are inside `sensotv.ro` folder (not at root)**

```bash
curl -s "http://127.0.0.1:50761/api/list" | node -e "
const fs=require('fs');let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  const items=JSON.parse(d).data;
  const sensotv=items.find(i=>i.title==='sensotv.ro');
  const children=items.filter(i=>i.parent_id===sensotv.id);
  console.log('sensotv children:', children.map(c=>c.title+' on='+c.on).join(', '));
  const expected=['vlad box2','alex box2','vps2','94.130.169.181'];
  expected.forEach(t=>{ if(!children.find(c=>c.title===t)) console.log('MISSING:', t); });
})"
# Expected: all 4 new children listed, none is missing
```

- [ ] **Step 8: Delete `toate diverse`**

```bash
curl -s -X DELETE http://127.0.0.1:50761/api/items/3fe59712-5ead-4633-8a8d-ca4d18c134cb
# Expected: {"success":true}
```

### Task 24: Rename slabsaugras.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/a43e967d-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `10.0.52.235` → `marina box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/2799e404-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "marina box2"}'
```

- [ ] **Step 3: `altele` → `vps`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/a04c2367-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps"}'
```

### Task 25: Rename springfarma.com children

- [ ] **Step 1: `spring 146.70.110.66` → `146.70.110.66`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/10fc77e3-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "146.70.110.66"}'
```

### Task 26: Rename tonica.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/0903360a-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `10.0.52.232 staging` → `staging vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/fcd000aa-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "staging vlad box2"}'
```

- [ ] **Step 3: `10.0.52.235` → `marina box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/31b2f911-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "marina box2"}'
```

- [ ] **Step 4: `10.0.52.233` → `alex box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/1293e5ec-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "alex box2"}'
```

- [ ] **Step 5: `altele` → `vps`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/8ff69720-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps"}'
```

### Task 27: Rename vladalexandru.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/be3da4ad-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

- [ ] **Step 2: `89.46.103.27` → `vps2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/e0de3811-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vps2"}'
```

### Task 28: Rename video.playmore.ro children

- [ ] **Step 1: `10.0.52.232` → `vlad box2`**

```bash
curl -s -X PUT http://127.0.0.1:50761/api/items/88e121c9-0000-0000-0000-000000000000 \
  -H "Content-Type: application/json" \
  -d '{"title": "vlad box2"}'
```

---

## Chunk 7: Create elearning.catena.ro folder and move items

### Task 29: Create elearning.catena.ro folder and populate it

The two existing standalone items (`elearning.catena.ro` off, `dev.elearning.catena.ro` ON) need to move into a new folder. The HTTP API doesn't support creating items inside a folder — **use the SwitchHosts UI for folder/item creation**, then set content via API.

- [ ] **Step 1: In SwitchHosts UI, create a new folder at top level**

Right-click on the root list → New folder → title: `elearning.catena.ro`

- [ ] **Step 2: In SwitchHosts UI, create child `vlad box2` inside the new folder**

Right-click on `elearning.catena.ro` folder → New item → title: `vlad box2` (leave disabled)

- [ ] **Step 3: In SwitchHosts UI, create child `dev vlad box2` inside the folder (enabled)**

Right-click on `elearning.catena.ro` folder → New item → title: `dev vlad box2`, toggle it ON

- [ ] **Step 4: Get IDs of the two new children**

```bash
curl -s "http://127.0.0.1:50761/api/list" | node -e "
const fs=require('fs');let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  const items=JSON.parse(d).data;
  const folder=items.find(i=>i.title==='elearning.catena.ro'&&i.type==='folder');
  if(!folder){console.log('ERROR: folder not found');return;}
  console.log('Folder id:', folder.id);
  const children=items.filter(i=>i.parent_id===folder.id);
  children.forEach(c=>console.log('Child:', c.id, c.title, 'on='+c.on));
})"
# Note the IDs for vlad box2 and dev vlad box2 children
```

- [ ] **Step 5: Set content for `vlad box2`**

```bash
# Replace VLAD_ID with the child id from Step 4
curl -s -X PUT "http://127.0.0.1:50761/api/content/VLAD_ID" \
  -H "Content-Type: application/json" \
  -d '{"content": "10.0.52.232\telearning.catena.ro\n"}'
# Expected: {"success":true}
```

- [ ] **Step 6: Set content for `dev vlad box2`**

```bash
# Replace DEV_VLAD_ID with the child id from Step 4
curl -s -X PUT "http://127.0.0.1:50761/api/content/DEV_VLAD_ID" \
  -H "Content-Type: application/json" \
  -d '{"content": "10.0.52.232\tdev.elearning.catena.ro\n"}'
# Expected: {"success":true}
```

- [ ] **Step 7: Verify the new folder and its children look correct**

```bash
curl -s "http://127.0.0.1:50761/api/list?include_content=true" | node -e "
const fs=require('fs');let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  const items=JSON.parse(d).data;
  const folder=items.find(i=>i.title==='elearning.catena.ro'&&i.type==='folder');
  console.log('Folder type:', folder ? folder.type : 'NOT FOUND');
  const children=items.filter(i=>i.parent_id===folder.id);
  children.forEach(c=>console.log(' -',c.title,'on='+c.on,'content='+JSON.stringify(c.content)));
})"
# Expected:
# Folder type: folder
# - vlad box2 on=false content="10.0.52.232\telearning.catena.ro\n"
# - dev vlad box2 on=true content="10.0.52.232\tdev.elearning.catena.ro\n"
```

- [ ] **Step 8: Delete the two old standalones**

First confirm their IDs are still the same (they haven't changed):

```bash
curl -s "http://127.0.0.1:50761/api/list" | node -e "
const fs=require('fs');let d='';process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>{
  const items=JSON.parse(d).data;
  ['elearning.catena.ro','dev.elearning.catena.ro'].forEach(t=>{
    const i=items.find(x=>x.title===t&&x.parent_id===null&&x.type!=='folder');
    if(i) console.log('Standalone found:', i.id, i.title);
    else console.log('Already gone or not standalone:', t);
  });
})"
```

```bash
# Delete the standalones (not the new folder)
curl -s -X DELETE http://127.0.0.1:50761/api/items/114549c8-0000-0000-0000-000000000000
curl -s -X DELETE http://127.0.0.1:50761/api/items/4e16207e-0000-0000-0000-000000000000
# Both Expected: {"success":true}
```

---

## Chunk 8: Final verification

### Task 30: Verify the full reorganization

- [ ] **Step 1: Get full list and check all folder children have proper names**

```bash
curl -s "http://127.0.0.1:50761/api/list?format=tree" > "$USERPROFILE/AppData/Local/Temp/swh_final.json"
node -e "
const fs = require('fs');
const data = JSON.parse(fs.readFileSync('C:/Users/vlad.tanasescu/AppData/Local/Temp/swh_final.json', 'utf8'));
const BAD_PATTERNS = [/^\d+\.\d+\.\d+\.\d+$/, /^altele$/, /^toate diverse$/, /staging\..*\d/, /\d+\.\d+\.\d+\.\d+.*staging/i];
let issues = 0;
function check(items, parentTitle) {
  for (const item of items) {
    if (item.type !== 'folder' && item.parent_id) {
      const bad = BAD_PATTERNS.some(p => p.test(item.title));
      if (bad) {
        console.log('NEEDS RENAME:', JSON.stringify(item.title), 'in', parentTitle);
        issues++;
      }
    }
    if (item.children) check(item.children, item.title);
  }
}
check(data.data, 'ROOT');
console.log(issues === 0 ? 'All children have proper names!' : issues + ' items still need renaming');
"
```

- [ ] **Step 2: Check no empty children remain**

```bash
curl -s "http://127.0.0.1:50761/api/list?include_content=true" > "$USERPROFILE/AppData/Local/Temp/swh_final_content.json"
node -e "
const fs = require('fs');
const items = JSON.parse(fs.readFileSync('C:/Users/vlad.tanasescu/AppData/Local/Temp/swh_final_content.json', 'utf8')).data;
const empty = items.filter(i => i.parent_id && !(i.content || '').trim());
if (empty.length === 0) {
  console.log('No empty children remaining!');
} else {
  console.log('Still empty:', empty.map(i => i.title).join(', '));
}
"
```

- [ ] **Step 3: Check folder names are correct**

```bash
node -e "
const fs = require('fs');
const items = JSON.parse(fs.readFileSync('C:/Users/vlad.tanasescu/AppData/Local/Temp/swh_final.json', 'utf8')).data;
const folders = items.filter(i => i.type === 'folder');
const bad = folders.filter(f => /[A-Z]/.test(f.title[0]) || f.title.endsWith('1'));
if (bad.length === 0) console.log('All folder names look correct!');
else bad.forEach(f => console.log('Bad folder name:', f.title));
"
```

- [ ] **Step 4: Confirm currently active items are still ON**

```bash
node -e "
const fs = require('fs');
const items = JSON.parse(fs.readFileSync('C:/Users/vlad.tanasescu/AppData/Local/Temp/swh_final.json', 'utf8')).data;
const on = items.filter(i => i.on);
console.log('Currently ON items:');
on.forEach(i => console.log(' -', i.title, '('+i.type+')'));
"
# Verify that items that were ON before are still ON (catena/vlad box2, farmaciata/vlad box2, etc.)
```

- [ ] **Step 5: Verify sensotv.ro children are inside the folder (not at root)**

```bash
node -e "
const fs = require('fs');
const items = JSON.parse(fs.readFileSync('C:/Users/vlad.tanasescu/AppData/Local/Temp/swh_final.json', 'utf8')).data;
const sensotv = items.find(i => i.title === 'sensotv.ro' && i.type === 'folder');
const children = items.filter(i => i.parent_id === sensotv.id);
const rootOrphans = items.filter(i => i.parent_id === null && ['vlad box2','alex box2','vps2','94.130.169.181'].includes(i.title));
console.log('sensotv children:', children.map(c=>c.title).join(', '));
if (rootOrphans.length) console.log('WARNING: These sensotv children are at root level:', rootOrphans.map(i=>i.title).join(', '));
else console.log('All sensotv children are inside the folder.');
"
```

- [ ] **Step 6: Verify `elearning.catena.ro` is type `folder` (not local)**

```bash
node -e "
const fs = require('fs');
const items = JSON.parse(fs.readFileSync('C:/Users/vlad.tanasescu/AppData/Local/Temp/swh_final.json', 'utf8')).data;
const el = items.find(i => i.title === 'elearning.catena.ro');
console.log('elearning type:', el ? el.type : 'NOT FOUND');
// Expected: elearning type: folder
"
```

---

## ID Reference Table

All IDs from the pre-reorganization snapshot. Use these when the full UUID is needed.

| Short ID | Full pattern | Item |
|----------|-------------|------|
| e856fae6 | `e856fae6-9ff8-4849-9819-90b76e7bb384` | ALL (standalone) |
| 3fe59712 | `3fe59712-5ead-4633-8a8d-ca4d18c134cb` | sensotv/toate diverse |
| 114549c8 | starts with `114549c8` | elearning.catena.ro (standalone) |
| 4e16207e | starts with `4e16207e` | dev.elearning.catena.ro (standalone) |

For any item not listed: look up the full ID at runtime with:

```bash
curl -s "http://127.0.0.1:50761/api/list?q=TITLE_SEARCH" | node -e "
process.stdin.resume();let d='';
process.stdin.on('data',c=>d+=c);
process.stdin.on('end',()=>JSON.parse(d).data.forEach(i=>console.log(i.id, i.title)))
"
```

---

## Notes

- **Item ordering is preserved** — `PUT /api/items/:id` only changes specified fields; position in list is unchanged
- **Content is preserved** — renaming an item never touches its hosts content
- **ON/OFF state is preserved** — renames do not toggle items
- **Deleted items go to trashcan** — recoverable from SwitchHosts UI if a mistake is made
- **sensotv and elearning require UI** — the HTTP API cannot place new items inside a specific folder; use the SwitchHosts UI for those two tasks
