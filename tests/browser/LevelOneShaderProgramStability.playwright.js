async (page) => {
  const applicationUrl = 'http://127.0.0.1:4173/?debug=1';
  const guardSelector = '[data-shader-program-guard]';

  const waitForRenderedFrames = async (count = 3) => {
    await page.evaluate(async (frameCount) => {
      for (let frame = 0; frame < frameCount; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }, count);
  };

  const readStableGuard = async (label, baseline) => {
    const status = (await page.locator(guardSelector).textContent())?.trim() ?? '';
    if (status.includes('Cold shader regression')) {
      throw new Error(`${label}: ${status}`);
    }
    const counts = status.match(/baseline (\d+) · highest (\d+)/);
    if (!counts) throw new Error(`${label}: unreadable shader guard: ${status}`);
    const observedBaseline = Number(counts[1]);
    const highest = Number(counts[2]);
    if (observedBaseline !== baseline) {
      throw new Error(
        `${label}: warm baseline changed from ${baseline} to ${observedBaseline}`,
      );
    }
    if (highest > baseline) {
      throw new Error(
        `${label}: renderer programs grew from ${baseline} to ${highest}`,
      );
    }
    return { label, programs: highest };
  };

  const visitRoom = async (room) => {
    await page.locator(
      `[data-action="room-teleport"][data-room-id="${room}"]`,
    ).evaluate((button) => button.click());
    await waitForRenderedFrames();
  };

  const sweepCamera = async () => {
    const canvas = page.locator('canvas');
    const bounds = await canvas.boundingBox();
    if (!bounds) throw new Error('The WebGL canvas has no rendered bounds.');
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    await canvas.click({ position: { x: bounds.width / 2, y: bounds.height / 2 } });
    await page.mouse.move(centerX + 180, centerY - 80, { steps: 4 });
    await page.mouse.move(centerX - 180, centerY + 80, { steps: 8 });
    await page.mouse.move(centerX, centerY, { steps: 4 });
    await waitForRenderedFrames();
  };

  await page.goto(applicationUrl, { waitUntil: 'domcontentloaded' });
  await page.locator(guardSelector).waitFor({ state: 'visible', timeout: 120_000 });
  await page.waitForFunction(
    (selector) =>
      document.querySelector(selector)?.textContent?.includes(
        'Shader programs stable',
      ),
    guardSelector,
    { timeout: 120_000 },
  );

  const initialStatus =
    (await page.locator(guardSelector).textContent())?.trim() ?? '';
  const baselineMatch = initialStatus.match(/baseline (\d+) · highest (\d+)/);
  if (!baselineMatch) {
    throw new Error(`Unable to read hidden-boot program baseline: ${initialStatus}`);
  }
  const baseline = Number(baselineMatch[1]);
  if (Number(baselineMatch[2]) !== baseline) {
    throw new Error(`Programs grew before traversal began: ${initialStatus}`);
  }

  await page.locator('[data-action="start"]').click();
  await waitForRenderedFrames(5);
  const checkpoints = [await readStableGuard('gameplay start', baseline)];

  await visitRoom(1);
  await sweepCamera();
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  await page.keyboard.up('w');
  await page.keyboard.down('Space');
  await page.waitForTimeout(180);
  await page.keyboard.up('Space');
  await waitForRenderedFrames();
  checkpoints.push(await readStableGuard('Room 1 traversal and jump', baseline));

  await visitRoom(2);
  await sweepCamera();
  checkpoints.push(await readStableGuard('Room 2 camera sweep', baseline));
  await page.keyboard.press('Tab');
  await waitForRenderedFrames();
  checkpoints.push(await readStableGuard('Room 2 Goop switch', baseline));
  await page.mouse.down({ button: 'right' });
  await waitForRenderedFrames();
  checkpoints.push(await readStableGuard('Room 2 acid aim', baseline));
  await page.mouse.click(400, 300, { button: 'left' });
  await page.mouse.up({ button: 'right' });
  await waitForRenderedFrames(5);
  checkpoints.push(
    await readStableGuard('Room 2 switching and acid presentation', baseline),
  );

  await visitRoom(3);
  await sweepCamera();
  await page.keyboard.down('a');
  await page.waitForTimeout(200);
  await page.keyboard.up('a');
  await waitForRenderedFrames();
  checkpoints.push(await readStableGuard('Room 3 traversal and camera sweep', baseline));

  await visitRoom(4);
  await sweepCamera();
  await page.keyboard.down('w');
  await page.waitForTimeout(250);
  await page.keyboard.up('w');
  await page.keyboard.press('Space');
  await waitForRenderedFrames();
  checkpoints.push(await readStableGuard('Room 4 lift approach', baseline));

  await visitRoom(5);
  await sweepCamera();
  await page.keyboard.down('d');
  await page.waitForTimeout(250);
  await page.keyboard.up('d');
  await waitForRenderedFrames(5);
  checkpoints.push(await readStableGuard('Room 5 traversal and camera sweep', baseline));

  return {
    baselinePrograms: baseline,
    checkpoints,
    guardStatus: (await page.locator(guardSelector).textContent())?.trim(),
  };
}
