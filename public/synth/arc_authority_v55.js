(function(){
  function safeBuildClass(summary){
    if(!summary) return 'dormant';
    if((summary.hubs||0) > 0 && (summary.relays||0) > 0) return 'networked_hub';
    if((summary.hubs||0) > 0) return 'hub';
    if((summary.relays||0) > 0) return 'relay';
    if((summary.structures||0) > 6) return 'dense_block';
    if((summary.roads||0) > 10) return 'corridor';
    return 'dormant';
  }

  function resolveWritebackDecision(input){
    const occ = input && input.occupancy ? input.occupancy : null;
    const summary = input && input.summary ? input.summary : null;
    const authority = input && input.authority ? input.authority : 'tile-local';
    const penalty = Number.isFinite(input && input.penalty) ? input.penalty : 0;
    const tick = Number.isFinite(input && input.tick) ? input.tick : 0;
    const lastTick = Number.isFinite(occ && occ.lastWritebackTick) ? occ.lastWritebackTick : -9999;
    const buildClass = input && input.buildClass ? input.buildClass : safeBuildClass(summary);
    const conflictWindow = 18;
    const out = {
      allowed: false,
      mode: 'idle',
      reason: 'no_activity',
      buildClass,
      targetType: occ && occ.type ? occ.type : 'room',
      targetMaterial: occ && occ.material ? occ.material : 'void',
      cooldown: 0
    };

    if(!occ || !occ.occupied){ out.reason = 'no_authority_tile'; return out; }
    if(authority === 'scanner-hold'){ out.mode = 'blocked'; out.reason = 'scanner_hold'; out.targetType = 'anomaly'; out.targetMaterial = 'quarantine'; return out; }
    if(buildClass === 'dormant'){ out.mode = 'idle'; out.reason = 'dormant'; return out; }
    if(penalty >= 0.85){ out.mode = 'blocked'; out.reason = 'penalty_lock'; return out; }
    if(tick - lastTick < conflictWindow){ out.mode = 'cooldown'; out.reason = 'writeback_cooldown'; out.cooldown = conflictWindow - (tick - lastTick); return out; }

    const existingClass = occ.microBuildClass || '';
    const committed = occ.commitState === 'COMMITTED' || !!occ.committed;
    const classChanged = !!existingClass && existingClass !== buildClass;
    const severeShift = classChanged && ((existingClass === 'hub' && buildClass === 'relay') || (existingClass === 'relay' && buildClass === 'hub') || (existingClass === 'networked_hub' && buildClass !== 'networked_hub'));
    if(committed && severeShift){ out.mode = 'conflict'; out.reason = 'committed_class_shift'; return out; }
    if(committed && penalty >= 0.5 && classChanged){ out.mode = 'conflict'; out.reason = 'committed_penalty_conflict'; return out; }

    out.allowed = true;
    out.mode = 'armed';
    out.reason = 'ready';
    out.targetMaterial = (buildClass === 'networked_hub' || buildClass === 'hub') ? 'core' : (buildClass === 'relay' ? 'signal' : ((buildClass === 'dense_block' || buildClass === 'corridor') ? 'mass' : (occ.material || 'void')));
    out.targetType = (buildClass === 'networked_hub' || buildClass === 'hub') ? 'hub' : (buildClass === 'relay' ? 'relay' : ((buildClass === 'dense_block' || buildClass === 'corridor') ? 'room' : (occ.type || 'room')));
    return out;
  }

  function auditShellConsistency(sh){
    const issues = [];
    if(!sh || !sh.occupancyMap) return {issues, counters:{occupied:0, committed:0, conflict:0}};
    let occupied = 0, committed = 0, conflict = 0;
    for(const [key, occ] of sh.occupancyMap.entries()){
      if(!occ) continue;
      if(occ.occupied) occupied++;
      if(occ.commitState === 'COMMITTED' || occ.committed) committed++;
      if((occ.type === 'anomaly') && occ.material !== 'quarantine') issues.push(`ANOMALY_MATERIAL:${key}`);
      if((occ.type === 'relay' || occ.type === 'hub') && !occ.occupied) issues.push(`UNOCCUPIED_INFRA:${key}`);
      if((occ.commitState === 'COMMITTED' || occ.committed) && !occ.occupied) issues.push(`COMMITTED_EMPTY:${key}`);
      if(occ.writebackDecision === 'conflict') conflict++;
      if(occ.writebackDecision === 'conflict' && !(occ.commitState === 'COMMITTED' || occ.committed)) issues.push(`NONCOMMITTED_CONFLICT:${key}`);
      if(occ.microPenalty > 0.9 && occ.writebackDecision === 'armed') issues.push(`PENALTY_BYPASS:${key}`);
    }
    return {issues, counters:{occupied, committed, conflict}};
  }

  window.ARC_AUTHORITY_TOOLS = {
    resolveWritebackDecision,
    auditShellConsistency,
    safeBuildClass
  };
})();
