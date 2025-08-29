/* ====== 状態 ====== */
let rows = [];
let basket = new Map();
let currentCat = '10';

/* ====== 定義 ====== */
const CATS = ['10','20','40','50','60','70','80','STORE_FRONT','STORE_SELECT'];
const CAT_LABELS = {
  '10':'10 肌着','20':'20 靴下','40':'40 子供服','50':'50 紳士服',
  '60':'60 雑貨','70':'70 ホームウェア','80':'80 婦人服',
  'STORE_FRONT':'店頭','STORE_SELECT':'ストアセレクト'
};
const PROMO_SLOTS = {
  '10': ['プロモ①','プロモ②'],
  '20': ['プロモ①','プロモ②'],
  '40': ['プロモ①','プロモ②','プロモ③','プロモ④'],
  '50': ['プロモ①','プロモ②','プロモ③','プロモ④'],
  '60': ['プロモ①','プロモ②','プロモ③','プロモ④'],
  '70': ['プロモ①','プロモ②','プロモ③','プロモ④'],
  '80': ['プロモ①','プロモ②','プロモ③','プロモ④'],
  'STORE_FRONT': ['全ワ①','全ワ②','全ラ①','全ラ②']
};
const AUTO_CATS = new Set(['40','50','70','80']);
const SPAN_OPTIONS = ['0','0.2','0.5','0.8','1','1.5','2'];
const CLOTHING_LARGE_SET = new Set(['10','40','50','70','80']);

/* スロット状態 */
const slotSpanState = new Map();    // `${cat}::${slot}` -> '0'..'2'
const slotOrderCache = new Map();   // `${cat}::${slot}` -> [sku,...]

/* ====== ヘルパ ====== */
const $ = s=>document.querySelector(s);
const $$ = s=>Array.from(document.querySelectorAll(s));
function fmtInt(v){ const n=parseInt(v,10); return isNaN(n)?0:n; }
function escapeHtml(s){ return (s??'').toString().replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function by(...keys){
  return (a,b)=>{
    for(const k of keys){
      const [key,dir='asc']=Array.isArray(k)?k:[k,'asc'];
      const va=a[key], vb=b[key];
      if(va===vb) continue;
      if(typeof va==='number'&&typeof vb==='number') return (va-vb)*(dir==='asc'?1:-1);
      return (va>vb?1:-1)*(dir==='asc'?1:-1);
    }
    return 0;
  };
}
function updateHeader(){ $('#headerSub').textContent = `データ: ${rows.length>0?'読込済':'未読込'} / 件数: ${rows.length}`; }
function setSections(){
  const hasData = rows.length>0;
  if(hasData){ $('#secStart').style.display = 'none'; }
  $('#secSelect').style.display = hasData ? '' : 'none';
  $('#secPrint').style.display = basket.size>0 ? '' : 'none';
  $('#catSlider').style.display = hasData ? '' : 'none';
}
function navigate(view){
  $$('.view').forEach(v=>v.classList.remove('active'));
  $(`#view-${view}`).classList.add('active');
  window.scrollTo({top:0, behavior:'instant'});
}
function setSlotSpan(cat, slot, span){ slotSpanState.set(`${cat}::${slot}`, span); }
function getSlotSpan(cat, slot){ return slotSpanState.get(`${cat}::${slot}`) ?? '0'; }
function setSlotOrder(cat, slot, skus){ slotOrderCache.set(`${cat}::${slot}`, skus.slice()); }
function getSlotOrder(cat, slot){ return slotOrderCache.get(`${cat}::${slot}`) ?? []; }

/* ====== CSV ====== */
function parseCsv(text){
  const lines = text.replace(/\r\n/g,"\n").replace(/\r/g,"\n").split("\n").filter(l=>l.trim().length>0);
  if(lines.length===0) return [];
  const parseLine=(line)=>{
    const out=[]; let cur='',q=false;
    for(let i=0;i<line.length;i++){
      const c=line[i],n=line[i+1];
      if(c==='"'&&q&&n==='"'){cur+='"';i++;continue;}
      if(c==='"'){q=!q;continue;}
      if(c===','&&!q){out.push(cur);cur='';continue;}
      cur+=c;
    }
    out.push(cur); return out;
  };
  const head = parseLine(lines[0]).map(h=>h.trim());
  return lines.slice(1).map(l=>{
    const cols=parseLine(l); const o={};
    head.forEach((h,i)=> o[h]= (cols[i]??'').trim());
    return o;
  });
}
function normalizeRows(parsed){
  return parsed.map(r=>{
    const hinban = r.品番 ?? r.hinban ?? r.HINBAN ?? r.sku ?? r.SKU ?? '';
    return {
      sku: hinban,
      name: r.name ?? r.名前 ?? '',
      price: fmtInt(r.price ?? r.価格), // 読み取りのみ（表示しない）
      category_large: r.category_large ?? r.categoryLarge ?? '',
      category_middle: r.category_middle ?? r.categoryMiddle ?? '',
      area_name: r.area_name ?? r.area ?? '',
      promo_class: r.promo_class ?? r.promo ?? '',
      is_focus_item: (r.is_focus_item ?? r.isFocus ?? '').toString()==='1' || (r.promo_class||r.promo||'')==='重点' ? 1:0,
      stock_salesfloor: fmtInt(r.stock_salesfloor ?? r.stockSalesfloor ?? r.Stock_salesfloor),
      stock_backroom: fmtInt(r.stock_backroom ?? r.stockBackroom ?? r.Stock_backroom)
    };
  });
}

/* ====== 半自動（上から順に付与） ====== */
const SPAN_THRESHOLDS = new Map([
  ['0', 0], ['0.2', 15], ['0.5', 39], ['0.8', 63], ['1', 79], ['1.5', 119], ['2', 159]
]);
function autoCheckForSpan(cat, slot, spanValue){
  const threshold = SPAN_THRESHOLDS.get(String(spanValue)) ?? 0;
  if(threshold === 0) return;

  let skus = getSlotOrder(cat, slot);
  if(skus.length===0){
    const all = rows.filter(r => (r.category_large||'').includes(cat) && (r.area_name||'').trim() === slot)
                    .sort(by(['category_middle','asc'], ['sku','asc']));
    skus = all.map(r=>r.sku);
    setSlotOrder(cat, slot, skus);
  }

  let total = 0;
  for(const sku of skus){
    if(total > threshold) break;
    const r = rows.find(x=> x.sku===sku);
    if(!r) continue;
    const isClothes = CLOTHING_LARGE_SET.has((r.category_large||'').slice(0,2));
    if(!isClothes) continue;

    if(basket.has(r.sku)){
      total += r.stock_backroom;
      continue;
    }
    basket.set(r.sku, r);
    total += r.stock_backroom;
  }
}

/* ====== スライダー ====== */
function buildCatSlider(){
  const track = $('#catTrack');
  track.innerHTML = '';
  CATS.forEach(cat=>{
    const chip = document.createElement('button');
    chip.className = 'cat-chip';
    chip.type = 'button';
    chip.setAttribute('role','tab');
    chip.setAttribute('data-cat', cat);
    chip.textContent = CAT_LABELS[cat];
    if(cat===currentCat) chip.classList.add('active');
    chip.addEventListener('click', ()=> selectCategory(cat, true));
    track.appendChild(chip);
  });
}
function moveSlider(dir){
  const idx = CATS.indexOf(currentCat);
  const nextIdx = Math.min(Math.max(idx + dir, 0), CATS.length-1);
  if(nextIdx !== idx) selectCategory(CATS[nextIdx], true);
}
$('#catPrev').addEventListener('click', ()=> moveSlider(-1));
$('#catNext').addEventListener('click', ()=> moveSlider(1));
function selectCategory(cat, scrollIntoView=false){
  currentCat = cat;
  $$('#catTrack .cat-chip').forEach(ch=> ch.classList.toggle('active', ch.getAttribute('data-cat')===cat));
  if(scrollIntoView){
    const active = $('#catTrack .cat-chip.active');
    if(active) active.scrollIntoView({behavior:'smooth', inline:'center', block:'nearest'});
  }
  renderCategory(cat);
}

/* ====== 描画（選択画面） ====== */
function isStoreFront(cat){ return cat==='STORE_FRONT'; }
function isStoreSelect(cat){ return cat==='STORE_SELECT'; }

function renderCategory(cat){
  const groups = $('#groupsContainer');

  if(isStoreSelect(cat)){
    groups.innerHTML = `
      <div class="group">
        <div class="group-head"><h3>ストアセレクト（メモ）</h3></div>
        <div class="list-wrap">
          <div class="row">
            <div class="grow"><textarea id="memo10" class="memo" placeholder="10のメモ"></textarea></div>
            <div class="grow"><textarea id="memo20" class="memo" placeholder="20のメモ"></textarea></div>
          </div>
          <div class="row">
            <div class="grow"><textarea id="memo40" class="memo" placeholder="40のメモ"></textarea></div>
            <div class="grow"><textarea id="memo50" class="memo" placeholder="50のメモ"></textarea></div>
          </div>
          <div class="row">
            <div class="grow"><textarea id="memo60" class="memo" placeholder="60のメモ"></textarea></div>
            <div class="grow"><textarea id="memo70" class="memo" placeholder="70のメモ"></textarea></div>
          </div>
          <div class="row">
            <div class="grow"><textarea id="memo80" class="memo" placeholder="80のメモ"></textarea></div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  let list = [];
  if(isStoreFront(cat)){
    const slots = PROMO_SLOTS['STORE_FRONT'];
    list = rows.filter(r => slots.includes((r.area_name||'').trim()))
               .sort(by(['area_name','asc'], ['category_large','asc'], ['sku','asc']));
  }else{
    const slots = PROMO_SLOTS[cat] || [];
    list = rows.filter(r=> (r.category_large||'').includes(cat) && slots.includes((r.area_name||'').trim()))
               .sort(by(['area_name','asc'], ['category_middle','asc'], ['sku','asc']));
  }
  renderGroupedByArea(list, cat);
}

function renderGroupedByArea(list, cat){
  const container = $('#groupsContainer');
  container.innerHTML = '';
  const slots = isStoreFront(cat) ? PROMO_SLOTS['STORE_FRONT'] : (PROMO_SLOTS[cat] || []);
  const groups = {}; slots.forEach(s=> groups[s]=[]);
  list.forEach(r=>{ const a=(r.area_name || '').trim(); if (slots.includes(a)) groups[a].push(r); });

  Object.keys(groups).forEach(slot=>{
    const items = groups[slot];
    setSlotOrder(cat, slot, items.map(r=>r.sku));

    const groupEl = document.createElement('div');
    groupEl.className='group';

    const head = document.createElement('div');
    head.className = 'group-head';
    const title = document.createElement('h3');
    title.textContent = slot;
    head.appendChild(title);

    // 半自動カテゴリ: スパン選択 + 追加文言（右側に配置）
    if(AUTO_CATS.has(cat)){
      const ctr = document.createElement('div');
      ctr.className = 'slot-controls';
      const select = document.createElement('select');
      select.setAttribute('data-slot', slot);
      const currentSpan = getSlotSpan(cat, slot);
      SPAN_OPTIONS.forEach(v=>{
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = `${v}スパン`;
        if(currentSpan===v) opt.selected = true;
        select.appendChild(opt);
      });
      if(!slotSpanState.has(`${cat}::${slot}`)) setSlotSpan(cat, slot, '0');
      select.addEventListener('change', ()=>{
        setSlotSpan(cat, slot, select.value);
        autoCheckForSpan(cat, slot, select.value);
        renderSingleGroup(container, cat, slot, groups[slot]);
        setSections();
      });
      const hint = document.createElement('span');
      hint.className = 'slot-hint';
      hint.textContent = '売場の空いているスパン数を選択';
      ctr.appendChild(select);
      ctr.appendChild(hint);
      head.appendChild(ctr);
    }

    groupEl.appendChild(head);

    const wrap = document.createElement('div');
    wrap.className='list-wrap';
    const listEl = document.createElement('div');
    listEl.className='list';

    if(items.length===0){
      const empty = document.createElement('div');
      empty.className='small muted';
      empty.textContent = '商品なし';
      listEl.appendChild(empty);
    }else{
      items.forEach(r=>{
        const id = `p_${r.sku}`;
        const checked = basket.has(r.sku) ? 'checked' : '';
        const item = document.createElement('div');
        item.className = 'item';
        item.innerHTML = `
          <div class="item-left" data-sku="${escapeHtml(r.sku)}" role="button" tabindex="0" aria-label="選択切替">
            <div class="item-title">
              <strong>${escapeHtml(r.name)}</strong>
              <span class="br-badge">BR在庫: ${r.stock_backroom}</span>
              ${r.is_focus_item?'<span class="pill">重点</span>':''}
            </div>
            <div class="item-meta">大:${escapeHtml(r.category_large)} / 中:${escapeHtml(r.category_middle||'-')} | 品番:${escapeHtml(formatHinban(r.sku))} | 場所:${escapeHtml(r.area_name||'-')}</div>
          </div>
          <div class="item-right">
            <input type="checkbox" class="chk" id="${id}" data-sku="${escapeHtml(r.sku)}" ${checked} />
          </div>
        `;
        listEl.appendChild(item);
      });
    }
    wrap.appendChild(listEl);
    groupEl.appendChild(wrap);
    container.appendChild(groupEl);
  });

  bindListInteractions(container);
}

function renderSingleGroup(container, cat, slot, items){
  let target=null;
  container.querySelectorAll('.group').forEach(g=>{
    const t=g.querySelector('.group-head h3')?.textContent?.trim();
    if(t===slot) target=g;
  });
  if(!target) return;
  const wrapOld = target.querySelector('.list-wrap');
  const wrap = document.createElement('div'); wrap.className='list-wrap';
  const listEl = document.createElement('div'); listEl.className='list';
  if((items||[]).length===0){
    const empty = document.createElement('div');
    empty.className='small muted'; empty.textContent='商品なし';
    listEl.appendChild(empty);
  }else{
    items.forEach(r=>{
      const id = `p_${r.sku}`;
      const checked = basket.has(r.sku) ? 'checked' : '';
      const item = document.createElement('div'); item.className='item';
      item.innerHTML = `
        <div class="item-left" data-sku="${escapeHtml(r.sku)}" role="button" tabindex="0" aria-label="選択切替">
          <div class="item-title">
            <strong>${escapeHtml(r.name)}</strong>
            <span class="br-badge">BR在庫: ${r.stock_backroom}</span>
            ${r.is_focus_item?'<span class="pill">重点</span>':''}
          </div>
          <div class="item-meta">大:${escapeHtml(r.category_large)} / 中:${escapeHtml(r.category_middle||'-')} | 品番:${escapeHtml(formatHinban(r.sku))} | 場所:${escapeHtml(r.area_name||'-')}</div>
        </div>
        <div class="item-right">
          <input type="checkbox" class="chk" id="${id}" data-sku="${escapeHtml(r.sku)}" ${checked} />
        </div>
      `;
      listEl.appendChild(item);
    });
  }
  wrap.appendChild(listEl);
  wrapOld.replaceWith(wrap);
  bindListInteractions(target);
}

/* 交互作用（選択画面） */
function bindListInteractions(root){
  root.querySelectorAll('input[type="checkbox"].chk').forEach(chk=>{
    chk.addEventListener('change', (e)=>{
      const sku = e.target.getAttribute('data-sku');
      const row = rows.find(x=> x.sku===sku);
      if(e.target.checked){ basket.set(sku, row); } else { basket.delete(sku); }
      setSections();
    });
  });
  root.querySelectorAll('.item-left').forEach(area=>{
    const toggle = ()=>{
      const sku = area.getAttribute('data-sku');
      const chk = area.parentElement.querySelector('input[type="checkbox"].chk');
      chk.checked = !chk.checked;
      chk.dispatchEvent(new Event('change'));
    };
    area.addEventListener('click', toggle);
    area.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' '){ e.preventDefault(); toggle(); }});
  });
}

/* 品番フォーマット */
function formatHinban(sku){
  const digits = (sku||'').replace(/\D/g,'');
  if(digits.length >= 9){ return `${digits.slice(0,5)}-${digits.slice(5,9)}`; }
  const padded = digits.padStart(9,'0');
  return `${padded.slice(0,5)}-${padded.slice(5,9)}`;
}

/* ストアセレクトのメモ */
function getMemoByCat(cat){
  switch(cat){
    case '10': return $('#memo10')?.value || '';
    case '20': return $('#memo20')?.value || '';
    case '40': return $('#memo40')?.value || '';
    case '50': return $('#memo50')?.value || '';
    case '60': return $('#memo60')?.value || '';
    case '70': return $('#memo70')?.value || '';
    case '80': return $('#memo80')?.value || '';
    default: return '';
  }
}

/* プレビュー */
function allRowsBySlot(cat, slot){
  const order = getSlotOrder(cat, slot);
  if(order.length>0){
    const map = new Map(rows.map(r=>[r.sku,r]));
    return order.map(sku=> map.get(sku)).filter(Boolean);
  }
  return rows.filter(r=> (r.category_large||'').includes(cat) && (r.area_name||'').trim()===slot)
             .sort(by(['category_middle','asc'], ['sku','asc']));
}
function buildPreviewPages(){
  const cats = ['10','20','40','50','60','70','80'];
  const storeSlots = PROMO_SLOTS['STORE_FRONT'];
  const selectedSet = new Set(Array.from(basket.keys()));

  const pages = [];
  for(const cat of cats){
    const entries = [];
    const floorSlots = PROMO_SLOTS[cat] || [];

    for(const slot of floorSlots){
      const all = allRowsBySlot(cat, slot);
      const sel = all.filter(r=> selectedSet.has(r.sku));
      sel.forEach(r=> entries.push({type:'item', row:r, muted:false, cat, slot}));
      if(sel.length > 0){
        const addable = all.filter(r=> !selectedSet.has(r.sku)).slice(0,2);
        addable.forEach(r=> entries.push({type:'item', row:r, muted:true, cat, slot}));
      }
    }
    for(const slot of storeSlots){
      const all = allRowsBySlot(cat, slot);
      const sel = all.filter(r=> selectedSet.has(r.sku));
      sel.forEach(r=> entries.push({type:'item', row:r, muted:false, cat, slot}));
      if(sel.length > 0){
        const addable = all.filter(r=> !selectedSet.has(r.sku)).slice(0,2);
        addable.forEach(r=> entries.push({type:'item', row:r, muted:true, cat, slot}));
      }
    }

    const memo = getMemoByCat(cat);
    if(memo.trim().length>0){
      entries.push({type:'memo', cat, memo});
    }

    const show = entries.some(e => e.type==='item' && !e.muted) || memo.trim().length>0;
    pages.push({cat, entries, show});
  }
  return pages;
}

/* プレビュー描画 */
function renderPreview(){
  const container = $('#previewPagesContainer');
  container.innerHTML = '';
  const pages = buildPreviewPages();
  const catsToRender = pages.filter(p=>p.show);

  catsToRender.forEach((page, idx)=>{
    const sec = document.createElement('section');
    sec.className = 'category-page' + (idx < catsToRender.length-1 ? ' break-after' : '');
    const h = document.createElement('h3');
    h.textContent = `大分類: ${page.cat}`;
    h.style.margin = '0 0 8px 0';
    sec.appendChild(h);

    const table = document.createElement('table');
    table.className = 'print-table';
    table.innerHTML = `
      <thead>
        <tr>
          <th style="width:28%;">場所/プロモ枠</th>
          <th style="width:34%;">品番</th>
          <th style="width:20%;">BR在庫</th>
          <th style="width:6%; text-align:center;">選</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    const tbody = table.querySelector('tbody');

    page.entries.forEach(entry=>{
      if(entry.type==='item'){
        const r = entry.row;

        const trTop = document.createElement('tr');
        if(entry.muted) trTop.classList.add('row-muted');
        trTop.setAttribute('data-sku', r.sku);

        const tdPlace = document.createElement('td');
        tdPlace.textContent = r.area_name || r.promo_class || '-';

        const tdSku = document.createElement('td');
        tdSku.className = 'sku-cell';
        tdSku.textContent = formatHinban(r.sku);

        const tdStock = document.createElement('td');
        tdStock.style.textAlign = 'right';
        tdStock.innerHTML = `<strong>${r.stock_backroom}</strong>`;

        const tdChk = document.createElement('td');
        tdChk.style.textAlign = 'center';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'pv-chk';
        cb.setAttribute('aria-label', '行をグレーアウト');
        cb.addEventListener('change', ()=>{
          trTop.classList.toggle('row-checked', cb.checked);
          const nameRow = trTop.nextElementSibling;
          if(nameRow && nameRow.classList.contains('name-row')){
            nameRow.style.opacity = cb.checked ? '0.55' : '';
          }
        });
        tdChk.appendChild(cb);

        trTop.appendChild(tdPlace);
        trTop.appendChild(tdSku);
        trTop.appendChild(tdStock);
        trTop.appendChild(tdChk);

        const trName = document.createElement('tr');
        trName.className = 'name-row';
        if(entry.muted) trName.classList.add('row-muted');
        const tdName = document.createElement('td');
        tdName.colSpan = 4;
        tdName.innerHTML = `<span class="name-label">商品名</span><span class="name-text">${escapeHtml(r.name)}</span>`;
        trName.appendChild(tdName);

        tbody.appendChild(trTop);
        tbody.appendChild(trName);
      }else if(entry.type==='memo'){
        const tr = document.createElement('tr');
        tr.classList.add('memo-row');
        tr.setAttribute('data-memo','1');

        const tdMemo = document.createElement('td');
        tdMemo.colSpan = 3;
        tdMemo.innerHTML = `<span class="memo-label">メモ（ストアセレクト）</span>: ${escapeHtml(entry.memo)}`;

        const tdChk = document.createElement('td');
        tdChk.style.textAlign = 'center';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.className = 'pv-chk pv-chk-memo';
        cb.setAttribute('aria-label', 'メモ行をグレーアウト');
        cb.addEventListener('change', ()=>{
          tr.classList.toggle('row-checked', cb.checked);
        });
        tdChk.appendChild(cb);

        tr.appendChild(tdMemo);
        tr.appendChild(tdChk);
        tbody.appendChild(tr);
      }
    });

    sec.appendChild(table);
    container.appendChild(sec);
  });

  bindPreviewToolbar();
  navigate('preview');
}

/* プレビュー操作（チェック済みを非表示） */
function bindPreviewToolbar(){
  const container = $('#previewPagesContainer');
  $('#pvHideChecked')?.addEventListener('click', ()=>{
    container.querySelectorAll('input.pv-chk:not(.pv-chk-memo):checked').forEach(cb=>{
      const trTop = cb.closest('tr');
      const trName = trTop?.nextElementSibling;
      if(trTop && trName && trName.classList.contains('name-row')){
        trName.remove();
      }
      trTop?.remove();
    });
    container.querySelectorAll('input.pv-chk-memo:checked').forEach(cb=>{
      const trMemo = cb.closest('tr');
      trMemo?.remove();
    });
  }, { once:false });
}

/* ====== イベント ====== */
$('#btnPreview').addEventListener('click', renderPreview);
$('#btnBack').addEventListener('click', ()=> navigate('main'));
$('#btnDoPrint').addEventListener('click', async ()=>{
  const items = Array.from(basket.values())
    .sort(by(['category_large','asc'], ['category_middle','asc'], ['sku','asc']))
    .map(r=>({
      category_large: r.category_large,
      category_middle: r.category_middle,
      hinban: formatHinban(r.sku),
      name: r.name,
      area_name: r.area_name,
      stock_backroom: r.stock_backroom
    }));
  await fetch('/api/print', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ job_name:'PickingList', copies:1, paper:'A4', orientation:'portrait', items })
  });
  navigate('main');
});

/* ====== 初期化・データ読み込み ====== */
function bootAfterData(){
  buildCatSlider();
  selectCategory('10', true);
}
$('#btnCreatePromo').addEventListener('click', ()=>{
  $('#csvFile').click();
});
$('#csvFile').addEventListener('change', async (e)=>{
  const f = e.target.files?.[0];
  if(!f) return;
  const txt = await f.text();
  rows = normalizeRows(parseCsv(txt));
  updateHeader();
  setSections();
  bootAfterData();
});

/* 初期 */
updateHeader();
setSections();