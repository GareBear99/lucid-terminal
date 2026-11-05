(function(){
  function auditRuntime(input){
    const issues = [];
    const warnings = [];
    const receipts = Array.isArray(input && input.receipts) ? input.receipts : [];
    const shell = input && input.shell ? input.shell : null;
    const tick = Number.isFinite(input && input.tick) ? input.tick : 0;
    if(shell){
      const total = shell.commitPlan && shell.commitPlan.length ? shell.commitPlan.length : ((shell.commitStats && shell.commitStats.total) || 0);
      if(Number.isFinite(shell.commitCursor) && total && shell.commitCursor > total) issues.push('COMMIT_CURSOR_OOB');
      if(shell.commitStats){
        const committed = shell.commitStats.committed||0;
        const planned = shell.commitStats.planned||0;
        if(total && committed + planned !== total) warnings.push('COMMIT_STATS_DRIFT');
      }
      if(shell.microAggregate && shell.microAggregate.held > shell.microAggregate.resident) issues.push('HELD_GT_RESIDENT');
    }
    const recent = receipts.slice(-40);
    const builder = recent.filter(r => r && r.kind === 'builder_commit');
    if(builder.length){
      const last = builder[builder.length-1];
      if(last && Number.isFinite(last.tick) && (tick - last.tick) > 240) warnings.push('BUILDER_STALE');
      if(builder.some(r => !(r.payload && r.payload.key))) issues.push('BUILDER_KEY_MISSING');
    }
    const imports = recent.filter(r => r && r.kind === 'micro_blueprint_import_failed');
    if(imports.length >= 3) warnings.push('REPEATED_IMPORT_FAILURES');
    return {issues, warnings};
  }

  function summarizeRecentBuilder(receipts){
    const list = Array.isArray(receipts) ? receipts.filter(r => r && r.kind === 'builder_commit').slice(-8).reverse() : [];
    return list.map((r, idx) => ({
      rank: idx + 1,
      tick: r.tick,
      key: r.payload && r.payload.key ? r.payload.key : '-',
      objectType: r.payload && r.payload.objectType ? r.payload.objectType : '-',
      progress: r.payload && r.payload.progress ? r.payload.progress : '-'
    }));
  }

  window.ARC_VALIDATOR_TOOLS = {
    auditRuntime,
    summarizeRecentBuilder
  };
})();
