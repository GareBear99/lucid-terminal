(function(){
  'use strict';
  function recoveryKey(baseKey, slot){ return `${baseKey}__recovery_${slot|0}`; }
  function manifestKey(baseKey){ return `${baseKey}__recovery_manifest`; }
  function readManifest(baseKey){
    try{ const raw = localStorage.getItem(manifestKey(baseKey)); const val = raw ? JSON.parse(raw) : []; return Array.isArray(val) ? val : []; }catch(err){ return []; }
  }
  function writeManifest(baseKey, items){
    try{ localStorage.setItem(manifestKey(baseKey), JSON.stringify(items.slice(0,16))); return true; }catch(err){ return false; }
  }
  function saveSurveyRecovery(payload, baseKey, reason, slotCount){
    const count = Math.max(1, Number(slotCount||3)|0);
    const manifest = readManifest(baseKey);
    const nextSlot = manifest.length ? (((manifest[0].slot|0) + 1) % count) : 0;
    const meta = { slot: nextSlot, savedAt: new Date().toISOString(), tick: Number(payload && payload.tick || 0)|0, reason: reason || 'autosave', version: payload && payload.version || null };
    localStorage.setItem(recoveryKey(baseKey, nextSlot), JSON.stringify(payload));
    const nextManifest = [meta].concat(manifest.filter(m => (m.slot|0) !== nextSlot));
    writeManifest(baseKey, nextManifest);
    return meta;
  }
  function listSurveyRecovery(baseKey, slotCount){
    const count = Math.max(1, Number(slotCount||3)|0);
    const manifest = readManifest(baseKey);
    return manifest.filter(m => typeof m.slot === 'number' && m.slot >= 0 && m.slot < count);
  }
  function loadSurveyRecovery(baseKey, slot){
    try{
      const raw = localStorage.getItem(recoveryKey(baseKey, slot));
      if(!raw) return null;
      const manifest = readManifest(baseKey);
      const meta = manifest.find(m => (m.slot|0) === (slot|0)) || { slot: slot|0 };
      return { raw, meta, slot: slot|0 };
    }catch(err){ return null; }
  }
  function loadLatestSurveyRecovery(baseKey, slotCount){
    const items = listSurveyRecovery(baseKey, slotCount);
    if(!items.length) return null;
    const latest = items.slice().sort((a,b)=> String(b.savedAt||'').localeCompare(String(a.savedAt||'')))[0];
    return loadSurveyRecovery(baseKey, latest.slot|0);
  }
  window.ARC_RECOVERY_TOOLS = { saveSurveyRecovery, listSurveyRecovery, loadSurveyRecovery, loadLatestSurveyRecovery };
})();
