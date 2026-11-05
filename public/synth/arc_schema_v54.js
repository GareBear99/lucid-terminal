(function(){
  'use strict';
  const ALLOWED_KINDS = new Set(['empty','road','hub','relay','tower','wall','gate','probe','anchor','power','signal','scan','build','core','room']);
  const ALLOWED_TOOLS = new Set(['road','erase','hub','relay','tower','wall','gate','probe','anchor','power','signal','scan','build']);
  const ALLOWED_DISTRICTS = new Set(['base','north','south','east','west','core','signal','power','quarantine']);
  function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
  function normalizeCell(cell, idx){
    const kind = cell && typeof cell.kind === 'string' && ALLOWED_KINDS.has(cell.kind) ? cell.kind : 'empty';
    const district = cell && typeof cell.district === 'string' && ALLOWED_DISTRICTS.has(cell.district) ? cell.district : 'base';
    return { idx: idx|0, kind, power: clamp(Number(cell && cell.power || 0), 0, 1), signal: clamp(Number(cell && cell.signal || 0), 0, 1), district };
  }
  function validateTileBlueprintPayload(payload){
    const issues = [];
    if(!payload || typeof payload !== 'object') return { ok:false, issues:[{code:'payload_missing'}], normalized:null };
    const src = payload.layer;
    if(!src || typeof src !== 'object') issues.push({code:'layer_missing'});
    const w = clamp((src && Number(src.w))|0, 1, 128);
    const h = clamp((src && Number(src.h))|0, 1, 128);
    if(!Array.isArray(src && src.cells)) issues.push({code:'cells_missing'});
    const maxCells = w*h;
    const cellsIn = Array.isArray(src && src.cells) ? src.cells : [];
    if(cellsIn.length > maxCells) issues.push({code:'cells_trimmed', count:cellsIn.length-maxCells});
    const cells = [];
    for(let i=0;i<Math.min(cellsIn.length, maxCells);i++) cells.push(normalizeCell(cellsIn[i], i));
    while(cells.length < maxCells) cells.push(normalizeCell(null, cells.length));
    const selected = clamp(((src && Number(src.selected))|0), 0, Math.max(0, maxCells-1));
    const tool = (src && typeof src.tool === 'string' && ALLOWED_TOOLS.has(src.tool)) ? src.tool : 'road';
    const normalized = {
      version: typeof payload.version === 'string' ? payload.version : 'unknown',
      schemaVersion: 'v54_tile_blueprint_schema',
      exportedAt: payload.exportedAt || null,
      shellId: payload.shellId || null,
      tile: payload.tile || null,
      key: payload.key || null,
      depth: Number(payload.depth||0)|0,
      authority: payload.authority || 'tile-local',
      buildClass: payload.buildClass || 'unknown',
      summary: payload.summary || null,
      graph: payload.graph || null,
      receipts: Array.isArray(payload.receipts) ? payload.receipts.slice(-64) : [],
      layer: { w, h, selected, tool, cells }
    };
    return { ok: issues.filter(i => i.code==='layer_missing' || i.code==='cells_missing').length === 0, issues, normalized };
  }
  window.ARC_SCHEMA_TOOLS = { validateTileBlueprintPayload };
})();
