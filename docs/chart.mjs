import { formatDate, money } from './model.mjs';

const shortMoney = (value) => {
  const sign = value < 0 ? '−' : '';
  const absolute = Math.abs(value);
  if (!absolute) return '0';
  const [base, unit] = absolute >= 1000000 ? [1000000, ' jt'] : absolute >= 1000 ? [1000, ' rb'] : [1, ''];
  return sign + new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(absolute / base) + unit;
};

function smooth(ctx, points) {
  ctx.moveTo(points[0].x, points[0].y);
  for (let index = 1; index < points.length; index++) {
    const a = points[index - 1];
    const b = points[index];
    const middle = (a.x + b.x) / 2;
    ctx.bezierCurveTo(middle, a.y, middle, b.y, b.x, b.y);
  }
}

export function mountChart(canvas, tooltip, data) {
  const ctx = canvas.getContext('2d');
  let coordinates = [];
  let active = -1;
  const step = (value) => {
    const exp = 10 ** Math.floor(Math.log10(value));
    return ([1, 2, 2.5, 5, 10].find((f) => f * exp >= value) ?? 10) * exp;
  };
  const largest = Math.max(0, ...data.flatMap((p) => [p.revenue, p.net]));
  const smallest = Math.min(0, ...data.flatMap((p) => [p.revenue, p.net]));
  const increment = step(Math.max(3000, largest - smallest) / 3);
  const low = Math.floor(smallest / increment) * increment;
  const high = Math.max(low + increment * 2, Math.ceil(largest / increment) * increment);

  function draw() {
    const width = canvas.clientWidth,
      height = canvas.clientHeight;
    if (!width || !height) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    const left = width < 360 ? 38 : 46,
      right = width - 15,
      top = 12,
      bottom = height - 25;
    const y = (amount) => bottom - ((amount - low) / (high - low)) * (bottom - top);
    ctx.font = '11px Inter, sans-serif';
    ctx.fillStyle = '#536b5c';
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let amount = low; amount <= high; amount += increment) {
      const row = y(amount);
      ctx.fillText(shortMoney(amount), left - 6, row);
      ctx.strokeStyle = amount ? '#edf2ed' : '#dce8df';
      ctx.beginPath();
      ctx.moveTo(left, row);
      ctx.lineTo(right, row);
      ctx.stroke();
    }
    coordinates = data.map((point, index) => ({
      x: data.length === 1 ? (left + right) / 2 : left + ((right - left) * index) / (data.length - 1),
      revenue: y(point.revenue),
      net: y(point.net),
    }));
    ctx.textAlign = 'center';
    coordinates.forEach((point, index) => {
      if (width < 375 && data.length > 5 && index % 2 && index !== data.length - 1) return;
      const short = formatDate(data[index].date).split(' ').slice(0, 2).join(' ');
      const x = Math.min(width - 22, Math.max(22, point.x));
      ctx.fillText(short, x, height - 11);
    });
    for (const key of ['revenue', 'net']) {
      const points = coordinates.map((point) => ({ x: point.x, y: point[key] }));
      const color = key === 'revenue' ? '#258861' : '#819943';
      if (key === 'revenue' && points.length > 1) {
        const fill = ctx.createLinearGradient(0, top, 0, bottom);
        fill.addColorStop(0, '#4ba67635');
        fill.addColorStop(1, '#56a77c05');
        ctx.beginPath();
        smooth(ctx, points);
        ctx.lineTo(points.at(-1).x, y(0));
        ctx.lineTo(points[0].x, y(0));
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.15;
      ctx.beginPath();
      smooth(ctx, points);
      ctx.stroke();
      points.forEach((point, index) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, index === active ? 4 : 2.35, 0, Math.PI * 2);
        ctx.fillStyle = 'white';
        ctx.fill();
        ctx.stroke();
      });
    }
  }

  const observer = new ResizeObserver(draw);
  observer.observe(canvas);
  canvas.addEventListener('pointermove', (event) => {
    if (!coordinates.length) return;
    const x = event.clientX - canvas.getBoundingClientRect().left;
    const distance = coordinates.map((point) => Math.abs(point.x - x));
    const next = distance.indexOf(Math.min(...distance));
    if (active === next) return;
    active = next;
    const point = data[next];
    tooltip.textContent =
      formatDate(point.date) + '\nOmzet ' + money(point.revenue) + ' · Laba ' + money(point.net);
    tooltip.style.whiteSpace = 'pre';
    tooltip.hidden = false;
    tooltip.style.left =
      Math.max(0, Math.min(canvas.clientWidth - tooltip.offsetWidth, coordinates[next].x + 7)) + 'px';
    tooltip.style.top = '1px';
    draw();
  });
  canvas.addEventListener('pointerleave', () => {
    active = -1;
    tooltip.hidden = true;
    draw();
  });
  return () => observer.disconnect();
}
