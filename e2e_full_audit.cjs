const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runAudit() {
  console.log('=== STARTING TASKHEAT FULL END-TO-END BROWSER AUDIT ===');
  const dataDir = path.join(__dirname, 'edge_audit_profile');
  if (fs.existsSync(dataDir)) {
    try {
      fs.rmSync(dataDir, { recursive: true, force: true });
    } catch (e) {}
  }
  fs.mkdirSync(dataDir, { recursive: true });

  const edgeProc = spawn(
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    [
      '--headless=new',
      '--remote-debugging-port=9223',
      `--user-data-dir=${dataDir}`,
      '--window-size=1280,800',
      'about:blank',
    ]
  );

  let targets = null;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      const res = await fetch('http://127.0.0.1:9223/json');
      targets = await res.json();
      break;
    } catch (e) {}
  }

  if (!targets) {
    console.error('FAIL: Could not connect to Edge on port 9223');
    try { edgeProc.kill(); } catch (e) {}
    process.exit(1);
  }

  const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);

  let msgId = 1;
  const pending = new Map();
  const consoleLogs = [];
  const exceptions = [];

  function send(method, params = {}) {
    const id = msgId++;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg.result);
      pending.delete(msg.id);
    }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = msg.params.args.map((a) => a.value || a.description).join(' ');
      consoleLogs.push({ type: msg.params.type, text });
      if (msg.params.type === 'error') {
        console.error('BROWSER CONSOLE ERROR:', text);
      }
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      const desc = msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text;
      exceptions.push(desc);
      console.error('BROWSER EXCEPTION:', desc);
    }
  };

  await new Promise((r) => (ws.onopen = r));
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');

  async function evaluate(code) {
    const res = await send('Runtime.evaluate', {
      expression: code,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
    }
    return res.result?.value;
  }

  const testReport = [];
  function assert(condition, testName) {
    if (condition) {
      console.log(`  ✓ PASS: ${testName}`);
      testReport.push({ pass: true, name: testName });
    } else {
      console.error(`  ✗ FAIL: ${testName}`);
      testReport.push({ pass: false, name: testName });
    }
  }

  try {
    // 1. Initial Load
    console.log('\n--- 1. Testing Initial Page Load & Visual Structure ---');
    await send('Page.navigate', { url: 'http://localhost:5173/' });
    await sleep(1500);

    assert(exceptions.length === 0, 'No uncaught JS exceptions during boot');

    const brandHeader = await evaluate(`
      (() => {
        const h = document.querySelector('.app-header');
        const logo = h?.querySelector('.app-header__logo');
        const title = h?.querySelector('.app-header__wordmark')?.textContent;
        return { hasHeader: !!h, hasLogo: !!logo, title };
      })()
    `);
    assert(brandHeader.hasHeader && brandHeader.hasLogo && brandHeader.title === 'TaskHeat', 'Brand header rendered with SVG logo and TaskHeat title');

    const statsRow = await evaluate(`
      (() => {
        const stats = document.querySelector('.heatmap__stats');
        const items = stats ? Array.from(stats.querySelectorAll('.heatmap__stat-label')).map(el => el.textContent) : [];
        return { hasStats: !!stats, items };
      })()
    `);
    assert(statsRow.hasStats && statsRow.items.includes('Total') && statsRow.items.includes('Streak'), 'Heatmap stats row rendered');

    const heatmapGrid = await evaluate(`
      (() => {
        const grid = document.querySelector('.heatmap__grid');
        const cells = document.querySelectorAll('.heatmap__cell');
        const legend = document.querySelectorAll('.heatmap__swatch');
        return { hasGrid: !!grid, cellCount: cells.length, legendCount: legend.length };
      })()
    `);
    assert(heatmapGrid.hasGrid && heatmapGrid.cellCount >= 365, `Heatmap grid rendered with 365+ cells (${heatmapGrid.cellCount})`);
    assert(heatmapGrid.legendCount === 5, 'Heatmap legend contains all 5 levels (0-4)');

    const emptyBoxCheck = await evaluate(`
      (() => {
        const focusBar = document.querySelector('.focus-bar');
        const focusBarHidden = !focusBar || focusBar.hasAttribute('hidden') || focusBar.style.display === 'none';
        const bannerRoot = document.getElementById('banner-root');
        const bannerRegion = bannerRoot?.querySelector('.banner-region');
        const bannerChildren = bannerRegion ? bannerRegion.children.length : 0;
        return { focusBarHidden, bannerEmpty: bannerChildren === 0 };
      })()
    `);
    assert(emptyBoxCheck.focusBarHidden, 'No empty focus bar container visible on blank state');

    // 2. Add Draft Task
    console.log('\n--- 2. Testing Task Draft Creation & Save Bar ---');
    const addResult = await evaluate(`
      (() => {
        const input = document.querySelector('.day__input');
        const addBtn = document.querySelector('.day__add-btn');
        input.value = 'Review pull request';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        const btnEnabledBefore = !addBtn.disabled;
        addBtn.click();
        const rows = document.querySelectorAll('.task-row');
        const draftChip = document.querySelector('.task-row__chip--draft');
        const saveBar = document.querySelector('.day__save-bar');
        const saveBtn = document.querySelector('.day__save-btn');
        return {
          btnEnabledBefore,
          rowCount: rows.length,
          hasDraftChip: !!draftChip,
          hasSaveBar: !!saveBar,
          saveBtnDisabled: saveBtn?.disabled,
        };
      })()
    `);
    assert(addResult.btnEnabledBefore, 'Add button enables when valid text is typed');
    assert(addResult.rowCount === 1 && addResult.hasDraftChip, 'Draft task row created with Draft chip');
    assert(addResult.hasSaveBar && addResult.saveBtnDisabled === false, 'Save bar appears with enabled Save button');

    // Verify task not counted in heatmap before save
    const countBeforeSave = await evaluate(`
      (() => {
        const stats = document.querySelector('.heatmap__stat-value');
        return stats?.textContent;
      })()
    `);
    assert(countBeforeSave === '0', 'Unsaved draft does NOT count toward stats or heatmap');

    // 3. Save Task
    console.log('\n--- 3. Testing Save Action & Persistence ---');
    const saveResult = await evaluate(`
      (() => {
        const saveBtn = document.querySelector('.day__save-btn');
        saveBtn.click();
        const draftChip = document.querySelector('.task-row__chip--draft');
        const saveBtnAfter = document.querySelector('.day__save-btn');
        const stored = localStorage.getItem('taskheat:v1');
        return {
          draftChipGone: !draftChip,
          saveBtnDisabledAfter: saveBtnAfter?.disabled,
          saveBtnText: saveBtnAfter?.textContent,
          storedLen: stored ? stored.length : 0,
        };
      })()
    `);
    assert(saveResult.draftChipGone, 'Draft chip removed after save');
    assert(saveResult.storedLen > 0, 'Tasks saved to localStorage under taskheat:v1');

    // 4. Discoverable Delete Button on Saved Task
    console.log('\n--- 4. Testing Discoverable Delete & Inline Confirmation ---');
    const deleteCheck = await evaluate(`
      (() => {
        const row = document.querySelector('.task-row');
        const delBtn = row?.querySelector('.task-row__delete');
        const confirmBox = row?.querySelector('.task-row__confirm');
        const confirmHiddenInitial = confirmBox ? confirmBox.hasAttribute('hidden') : false;
        
        // Click delete to reveal confirm
        delBtn?.click();
        const confirmVisibleAfter = confirmBox ? !confirmBox.hasAttribute('hidden') : false;
        
        // Click No to cancel
        const noBtn = row?.querySelector('.task-row__no');
        noBtn?.click();
        const confirmHiddenAfterCancel = confirmBox ? confirmBox.hasAttribute('hidden') : false;

        return {
          hasDeleteBtn: !!delBtn,
          confirmHiddenInitial,
          confirmVisibleAfter,
          confirmHiddenAfterCancel,
        };
      })()
    `);
    assert(deleteCheck.hasDeleteBtn, 'Saved task has discoverable Delete button');
    assert(deleteCheck.confirmHiddenInitial && deleteCheck.confirmVisibleAfter, 'Inline confirm reveals on Delete click');
    assert(deleteCheck.confirmHiddenAfterCancel, 'Inline confirm hides on No click');

    // 5. Complete Task & Celebrate State
    console.log('\n--- 5. Testing Task Completion, Heatmap Cell Pop, & All-Done State ---');
    const completeResult = await evaluate(`
      (() => {
        const checkbox = document.querySelector('.task-row__checkbox');
        checkbox.click();
        const isDone = document.querySelector('.task-row.is-done');
        const progress = document.querySelector('.day__progress-text')?.textContent;
        // Save to commit the completion to the heatmap
        document.querySelector('.day__save-btn').click();
        const allDoneBox = document.querySelector('.day__all-done');
        const allDoneVisible = allDoneBox && !allDoneBox.hasAttribute('hidden');
        return { hasDoneClass: !!isDone, allDoneVisible, progress };
      })()
    `);
    await sleep(300); // Wait for RAF to paint heatmap stats
    assert(completeResult.hasDoneClass, 'Task row marked done with strikethrough');
    assert(completeResult.progress === '1 of 1 done', 'Progress reads "1 of 1 done"');
    assert(completeResult.allDoneVisible, 'Celebratory "All done for today 🎉" empty state displayed');

    const statsAfterComplete = await evaluate(`
      (() => {
        const vals = Array.from(document.querySelectorAll('.heatmap__stat-value')).map(el => el.textContent.trim());
        return vals; // [total, streak, longest, bestDay]
      })()
    `);
    assert(statsAfterComplete[0] === '1', 'Heatmap total completed stats incremented to 1');
    assert(statsAfterComplete[1] === '1d', 'Current streak incremented to 1d');

    // 6. Roulette / Gamble Flow
    console.log('\n--- 6. Testing Task Roulette & Focus Bar Flow ---');
    // Add two new tasks to test gamble
    await evaluate(`
      (() => {
        const input = document.querySelector('.day__input');
        const addBtn = document.querySelector('.day__add-btn');
        input.value = 'Optimize SQL indexes';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        addBtn.click();
        input.value = 'Refactor auth middleware';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        addBtn.click();
        document.querySelector('.day__save-btn').click();
      })()
    `);
    await sleep(300);

    const gambleBtnCheck = await evaluate(`
      (() => {
        const btn = document.querySelector('.day__gamble-btn');
        return { text: btn?.textContent, disabled: btn?.disabled };
      })()
    `);
    assert(!gambleBtnCheck.disabled, `Gamble button enabled: "${gambleBtnCheck.text}"`);

    // Click gamble to open roulette modal and start spin
    console.log('  Triggering Gamble to start roulette spin...');
    await evaluate(`document.querySelector('.day__gamble-btn').click();`);
    await sleep(400);

    const rouletteModal = await evaluate(`
      (() => {
        const dialog = document.querySelector('dialog.roulette');
        const title = dialog?.querySelector('.roulette__title')?.textContent;
        return {
          isOpen: dialog ? dialog.hasAttribute('open') : false,
          title,
        };
      })()
    `);
    assert(rouletteModal.isOpen, `Roulette dialog opened and spinning: "${rouletteModal.title}"`);

    // Wait for wheel animation (3500ms) to complete and display winner
    console.log('  Waiting for 3.5s spin animation to land...');
    await sleep(4200);

    const resultReady = await evaluate(`
      (() => {
        const dialog = document.querySelector('dialog.roulette');
        const goBtn = dialog?.querySelector('.roulette__go-btn');
        return { hasGoBtn: !!goBtn };
      })()
    `);
    assert(resultReady.hasGoBtn, 'Spin completed and "Let\'s go!" focus button displayed');

    // Click "Let's go!" to start focus mode
    console.log('  Starting focus mode via "Let\'s go!" button...');
    await evaluate(`document.querySelector('.roulette__go-btn').click();`);
    await sleep(400);

    const focusBarActive = await evaluate(`
      (() => {
        const focusBar = document.querySelector('.focus-bar');
        const isVisible = focusBar && !focusBar.hasAttribute('hidden') && focusBar.style.display !== 'none';
        const taskTitle = focusBar?.querySelector('.focus-bar__task')?.textContent;
        const completeBtn = focusBar?.querySelector('.focus-bar__done');
        const nowTag = document.querySelector('.task-row__now-tag');
        const gambleBtn = document.querySelector('.day__gamble-btn');
        return {
          isVisible,
          taskTitle,
          hasCompleteBtn: !!completeBtn,
          hasNowTag: !!nowTag,
          gambleDisabled: gambleBtn?.disabled,
          gambleText: gambleBtn?.textContent,
        };
      })()
    `);
    assert(focusBarActive.isVisible, `Focus bar is visible for chosen task: "${focusBarActive.taskTitle}"`);
    assert(focusBarActive.hasNowTag, 'Task in focus has "Now" tag in task list');
    assert(focusBarActive.gambleDisabled, `Gamble button disabled while task in focus: "${focusBarActive.gambleText}"`);

    // Test Pick Survives Page Reload
    console.log('  Testing pick persistence across page reload...');
    await send('Page.reload');
    await sleep(1500);

    const reloadPickCheck = await evaluate(`
      (() => {
        const focusBar = document.querySelector('.focus-bar');
        const isVisible = focusBar && !focusBar.hasAttribute('hidden') && focusBar.style.display !== 'none';
        const nowTag = document.querySelector('.task-row__now-tag');
        return { isVisible, hasNowTag: !!nowTag };
      })()
    `);
    assert(reloadPickCheck.isVisible && reloadPickCheck.hasNowTag, 'Active pick and focus bar restored after refresh');

    // Complete task from focus bar
    console.log('  Completing task via Focus Bar Done button...');
    await evaluate(`document.querySelector('.focus-bar__done').click();`);
    await sleep(500);

    // Dismiss the post-completion prompt in the bar
    await evaluate(`
      (() => {
        const dismissBtn = document.querySelector('.focus-bar__dismiss') || document.querySelector('.focus-bar .btn--accent');
        dismissBtn?.click();
      })()
    `);
    await sleep(400);
    await sleep(500);

    const focusBarAfterComplete = await evaluate(`
      (() => {
        const focusBar = document.querySelector('.focus-bar');
        const isHidden = !focusBar || focusBar.hasAttribute('hidden') || focusBar.style.display === 'none';
        const nowTag = document.querySelector('.task-row__now-tag');
        const totalCompleted = document.querySelectorAll('.heatmap__stat-value')[0]?.textContent;
        return { isHidden, nowTagGone: !nowTag, totalCompleted };
      })()
    `);
    assert(focusBarAfterComplete.isHidden, 'Focus bar cleanly hidden after completion (no empty box)');
    assert(focusBarAfterComplete.nowTagGone, '"Now" tag cleared from task');
    assert(focusBarAfterComplete.totalCompleted === '2', 'Stats show 2 total completed');

    // 7. Settings and Help Dialogs
    console.log('\n--- 7. Testing Settings & Help Modals ---');
    await evaluate(`document.querySelector('.app-header__action-btn[aria-label="Settings"]').click();`);
    await sleep(300);

    const settingsOpen = await evaluate(`
      (() => {
        const d = document.querySelector('dialog.dialog');
        const title = d?.querySelector('.dialog__title')?.textContent;
        return { isOpen: d?.hasAttribute('open'), title };
      })()
    `);
    assert(settingsOpen.isOpen && settingsOpen.title?.includes('Settings'), 'Settings dialog opened');

    // Close Settings
    await evaluate(`document.querySelector('.dialog__close').click();`);
    await sleep(200);

    // Open Help via '?' key
    await evaluate(`
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true }));
    `);
    await sleep(300);

    const helpOpen = await evaluate(`
      (() => {
        const dialogs = Array.from(document.querySelectorAll('dialog'));
        const openHelp = dialogs.find(d => d.hasAttribute('open') && d.textContent.includes('Keyboard shortcuts'));
        return !!openHelp;
      })()
    `);
    assert(helpOpen, 'Keyboard shortcut "?" opens Keyboard Shortcuts help dialog');

    await evaluate(`document.querySelectorAll('.dialog__close').forEach(b => b.click());`);
    await sleep(200);

    // 8. Responsive Audit (375px mobile viewport)
    console.log('\n--- 8. Testing Responsive Layout (375px Mobile) ---');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 375,
      height: 667,
      deviceScaleFactor: 2,
      mobile: true,
    });
    await sleep(500);

    const overflowCheck = await evaluate(`
      (() => {
        const docWidth = document.documentElement.clientWidth;
        const htmlScroll = document.documentElement.scrollWidth;
        const bodyScroll = document.body.scrollWidth;
        const h = document.querySelector('.app-header');
        const hInfo = {
          scrollWidth: h?.scrollWidth,
          clientWidth: h?.clientWidth,
          children: Array.from(h?.children || []).map(c => ({
            tag: c.tagName,
            cls: c.className,
            sw: c.scrollWidth,
            cw: c.clientWidth,
            ow: c.offsetWidth,
            sub: Array.from(c.children || []).map(s => ({ cls: s.className, sw: s.scrollWidth, ow: s.offsetWidth }))
          }))
        };
        // Find elements with scrollWidth > docWidth
        const scrollW = Array.from(document.querySelectorAll('*'))
          .filter(el => el.scrollWidth > docWidth && !el.classList.contains('heatmap__scroll'))
          .map(el => ({ tag: el.tagName, class: el.className, scrollWidth: el.scrollWidth }))
          .slice(0, 10);
        return { docWidth, htmlScroll, bodyScroll, scrollW, hInfo, hasPageScroll: htmlScroll > docWidth };
      })()
    `);
    console.log('  Header debug info:', JSON.stringify(overflowCheck.hInfo));
    console.log('  Elements with scrollWidth > docWidth:', JSON.stringify(overflowCheck.scrollW));
    assert(!overflowCheck.hasPageScroll, `No horizontal page scroll on 375px mobile (viewport=${overflowCheck.docWidth}, pageScrollWidth=${overflowCheck.htmlScroll})`);

    // Reset emulation
    await send('Emulation.clearDeviceMetricsOverride');

  } catch (err) {
    console.error('UNEXPECTED TEST HARNESS ERROR:', err);
    testReport.push({ pass: false, name: `Exception: ${err.message}` });
  } finally {
    try {
      ws.close();
      edgeProc.kill();
      // On Windows ensure taskkill kills process tree
      execSync(`taskkill /F /T /PID ${edgeProc.pid} 2>nul || exit 0`, { shell: 'cmd.exe' });
    } catch (e) {}
  }

  console.log('\n=== AUDIT SUMMARY ===');
  const passed = testReport.filter((t) => t.pass).length;
  const failed = testReport.filter((t) => !t.pass).length;
  console.log(`Passed: ${passed} / ${testReport.length}`);
  console.log(`Failed: ${failed} / ${testReport.length}`);
  console.log(`Console Errors: ${consoleLogs.filter((l) => l.type === 'error').length}`);
  console.log(`Browser Exceptions: ${exceptions.length}`);

  if (failed > 0 || exceptions.length > 0) {
    process.exit(1);
  } else {
    console.log('\n>>> ALL REAL-BROWSER AUDIT CHECKS PASSED PERFECTLY! <<<');
    process.exit(0);
  }
}

runAudit();
