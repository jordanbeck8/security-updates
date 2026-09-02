// SITREP globe — d3 orthographic, real country outlines, drag to rotate, auto-spin when idle.
window.SitrepGlobe = function (svgEl, opts) {
  const W = 440, R = 212;
  const proj = d3.geoOrthographic().scale(R).translate([W / 2, W / 2]).clipAngle(90);
  const path = d3.geoPath(proj);
  const svg = d3.select(svgEl).attr('viewBox', `0 0 ${W} ${W}`);
  const g = svg.append('g');
  g.append('path').datum({ type: 'Sphere' }).attr('class', 'gl-sphere');
  const grat = g.append('path').datum(d3.geoGraticule().step([15, 15])()).attr('class', 'gl-grat');
  const land = g.append('path').attr('class', 'gl-land');
  const pinsG = g.append('g');
  const sphere = g.select('.gl-sphere');
  let rotate = [-30, -28], idleAt = 0, dragging = false, land110 = null, anim = null, active = null;

  const pins = pinsG.selectAll('g').data(opts.theaters).join('g').attr('class', 'gl-pin').style('cursor', 'pointer')
    .on('click', (e, d) => { e.stopPropagation(); focus(d); opts.onSelect && opts.onSelect(d); });
  pins.append('circle').attr('class', 'gl-ring').attr('r', 9);
  pins.append('rect').attr('x', -4).attr('y', -4).attr('width', 8).attr('height', 8);
  pins.append('text').attr('x', 14).attr('y', 3).text(d => d.num + ' ' + d.code);

  function draw() {
    proj.rotate(rotate);
    sphere.attr('d', path); grat.attr('d', path);
    if (land110) land.attr('d', path(land110));
    const center = [-rotate[0], -rotate[1]];
    pins.attr('transform', d => { const p = proj(d.coord); return `translate(${p[0]},${p[1]})`; })
      .attr('opacity', d => { const dist = d3.geoDistance(d.coord, center); return dist > Math.PI / 2 - 0.05 ? 0 : Math.min(1, (Math.PI / 2 - dist) * 3); })
      .style('pointer-events', d => d3.geoDistance(d.coord, center) > Math.PI / 2 - 0.1 ? 'none' : null)
      .classed('is-active', d => active && d.code === active.code);
    // flip labels on the right half so they never leave the disc
    pins.select('text').attr('x', d => proj(d.coord)[0] > W * 0.62 ? -14 : 14).attr('text-anchor', d => proj(d.coord)[0] > W * 0.62 ? 'end' : 'start');
  }

  fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json').then(r => r.json()).then(topo => {
    land110 = topojson.feature(topo, topo.objects.countries); draw();
  }).catch(() => {});

  const k = 75 / R;
  svg.call(d3.drag()
    .on('start', () => { dragging = true; stopAnim(); svgEl.classList.add('is-dragging'); })
    .on('drag', e => { rotate = [rotate[0] + e.dx * k, Math.max(-70, Math.min(70, rotate[1] - e.dy * k))]; draw(); })
    .on('end', () => { dragging = false; idleAt = performance.now() + 3500; svgEl.classList.remove('is-dragging'); }));
  svgEl.addEventListener('pointerenter', () => { idleAt = Infinity; });
  svgEl.addEventListener('pointerleave', () => { if (!dragging) idleAt = performance.now() + 1500; });

  let last = 0;
  d3.timer(el => {
    const dt = Math.min(50, el - last); last = el;
    if (!dragging && !anim && performance.now() > idleAt && !opts.reduced) { rotate[0] += dt * 0.006; draw(); }
  });

  function stopAnim() { if (anim) { anim.stop(); anim = null; } }
  function focus(t) {
    active = t; stopAnim();
    const from = rotate.slice(), to = [-t.coord[0], -Math.max(-40, Math.min(40, t.coord[1] - 8))];
    let dl = to[0] - from[0]; dl = ((dl % 360) + 540) % 360 - 180; to[0] = from[0] + dl;
    const ip = d3.interpolate(from, to);
    anim = d3.timer(el => { const p = Math.min(1, el / 1100); rotate = ip(d3.easeCubicInOut(p)).slice(); draw(); if (p === 1) { stopAnim(); idleAt = performance.now() + 6000; } });
  }
  draw();
  return { focus, setActive: t => { active = t; draw(); } };
};
