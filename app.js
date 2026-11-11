const $ = (selector) => document.querySelector(selector);
const REGION_ALIASES = {
  "内蒙古": ["内蒙古自治区"], "广西": ["广西壮族自治区"], "西藏": ["西藏自治区"],
  "宁夏": ["宁夏回族自治区"], "新疆": ["新疆维吾尔自治区"],
  "香港": ["香港特别行政区"], "澳门": ["澳门特别行政区"],
};
const PALETTES = {
  blue: ["#12304b", "#174d70", "#167b9c", "#20a9be", "#68d2d5", "#b8f0e4", "#e4f6eb"],
  teal: ["#123c43", "#17665e", "#268a6c", "#59aa65", "#a8c65b", "#e1d65a", "#fff0a6"],
  amber: ["#49301f", "#794124", "#a95b2a", "#d47a35", "#e6a24a", "#f0ca71", "#fff0c2"],
};
const app = {
  raw: null, regions: [], byCode: new Map(), featureByCode: new Map(),
  metric: "gdp", method: "quantile", bins: 5, palette: "blue",
  reverse: false, expression: "choropleth", selected: null,
  preCompareExpression: null,
  map: null, geoLayer: null, symbolLayer: null, cityLayer: null,
  compareMap: null, compareLayer: null, compareSymbols: null, chart: null,
};

function normalizeName(text) {
  return String(text || "").replace(/(?:特别行政区|自治区|维吾尔|壮族|回族|省|市)/g, "").trim();
}
function codeOf(properties) {
  const code = properties?.adcode ?? properties?.ADCODE ?? properties?.code;
  return code == null ? null : String(code).padStart(6, "0");
}
function metricMeta(key = app.metric) {
  return app.raw.metrics[key] || { label: key, unit: "", sourceName: "来源未提供", sourceUrl: "", methodology: "" };
}
function metricValue(region, key = app.metric) {
  if (key === "density") return region.derivedDensity ?? null;
  return region.values?.[key] ?? null;
}
function formatNumber(value, key = app.metric) {
  if (!Number.isFinite(value)) return "缺失";
  const decimals = key === "gdp" ? 0 : 2;
  return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: decimals });
}
function valuesFor(key = app.metric) {
  return app.regions.map((region) => metricValue(region, key)).filter(Number.isFinite).sort((a, b) => a - b);
}
function classBreaks(values, count = app.bins, method = app.method) {
  if (!values.length) return [];
  const min = values[0];
  const max = values[values.length - 1];
  if (method === "equal") return Array.from({ length: count - 1 }, (_, i) => min + ((max - min) * (i + 1)) / count);
  return Array.from({ length: count - 1 }, (_, i) => values[Math.max(0, Math.ceil(((i + 1) * values.length) / count) - 1)]);
}
function classification(key = app.metric, method = app.method) {
  const values = valuesFor(key);
  return { values, breaks: classBreaks(values, app.bins, method), min: values[0], max: values.at(-1) };
}
function classIndex(value, breaks) {
  return breaks.findIndex((edge) => value <= edge) < 0 ? breaks.length : breaks.findIndex((edge) => value <= edge);
}
function colorsFor() {
  const base = PALETTES[app.palette].slice(0, app.bins);
  return app.reverse ? base.reverse() : base;
}
function colorFor(value, key = app.metric, method = app.method) {
  if (!Number.isFinite(value)) return "#243444";
  const { breaks } = classification(key, method);
  return colorsFor()[classIndex(value, breaks)] || "#243444";
}
function intervalLabel(index, info, key = app.metric, method = app.method) {
  const lower = index === 0 ? info.min : info.breaks[index - 1];
  const upper = index === app.bins - 1 ? info.max : info.breaks[index];
  const suffix = metricMeta(key).unit;
  const left = index === 0 ? "[" : "(";
  return `${left}${formatNumber(lower, key)} – ${formatNumber(upper, key)} ${suffix}`;
}
function setStatus(message, state = "info") {
  const element = $("#loadmsg");
  element.textContent = message;
  element.dataset.state = state;
}
function areaKm2(geometry) {
  const ringArea = (ring) => {
    let sum = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j]; const [x2, y2] = ring[i];
      sum += (x2 - x1) * Math.PI / 180 * (2 + Math.sin(y1 * Math.PI / 180) + Math.sin(y2 * Math.PI / 180));
    }
    return Math.abs(sum * 6378137 * 6378137 / 2) / 1e6;
  };
  const polygonArea = (polygon) => ringArea(polygon[0]) - polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0);
  if (geometry.type === "Polygon") return polygonArea(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
  return 0;
}

function styleFeature(feature, method = app.method) {
  const code = codeOf(feature.properties);
  const region = app.byCode.get(code);
  const value = region && metricValue(region);
  const isSelected = app.selected === code;
  if (app.expression === "symbols" && method === app.method) {
    return { color: "#436478", weight: isSelected ? 2.5 : 0.7, fillColor: "#10273a", fillOpacity: 0.62 };
  }
  return {
    color: isSelected ? "#f2fbff" : "#587f94",
    weight: isSelected ? 2.5 : 0.8,
    fillColor: colorFor(value, app.metric, method),
    fillOpacity: Number.isFinite(value) ? 0.87 : 0.28,
  };
}
function popupHtml(region) {
  const meta = metricMeta();
  const value = metricValue(region);
  const missing = Number.isFinite(value) ? `${formatNumber(value)} ${meta.unit}` : "暂无可核验数据";
  const source = meta.sourceUrl ? `<a href="${meta.sourceUrl}" target="_blank" rel="noreferrer">${meta.sourceName}</a>` : meta.sourceName;
  return `<div class="map-popup"><b>${region.name}</b><strong>${missing}</strong><small>统计年份：${app.raw.year} · 来源：${source}</small><small>口径：${meta.methodology}</small><small>核验状态：${meta.verificationStatus || "未注明"}</small></div>`;
}
function selectRegion(code, zoom = true) {
  const region = app.byCode.get(String(code));
  if (!region) return;
  app.selected = region.adcode;
  if (zoom) {
    const featureLayer = app.geoLayer?.getLayer(app.featureByCode.get(region.adcode)?._leaflet_id);
    const target = featureLayer || app.featureByCode.get(region.adcode)?.layer;
    if (target) app.map.fitBounds(target.getBounds(), { padding: [48, 48], maxZoom: 6 });
  }
  renderDetail(region);
  paintMap();
  renderRanking();
  renderChart();
  if (app.compareMap) paintCompareMap();
}
function renderDetail(region) {
  const keys = ["gdp", "population", "density", "urban"];
  $("#detail").innerHTML = `<h2>${region.name}</h2><div class="detail-code">行政区划代码 ${region.adcode}</div>${keys.map((key) => {
    const meta = metricMeta(key); const value = metricValue(region, key);
    return `<div class="metric"><span>${meta.label}</span><strong>${Number.isFinite(value) ? `${formatNumber(value, key)} ${meta.unit}` : "暂无核验数据"}</strong></div>`;
  }).join("")}`;
}
function renderLegend(key = app.metric, method = app.method) {
  const meta = metricMeta(key); const info = classification(key, method); const colors = colorsFor();
  $("#legendTitle").textContent = `${meta.label}（${meta.unit}）`;
  if (key === app.metric && app.expression === "symbols") {
    const samples = info.values.length ? [info.values[0], info.values[Math.floor((info.values.length - 1) / 2)], info.max] : [];
    const max = info.max || 1;
    $("#legendItems").innerHTML = samples.length ? samples.map((value) =>
      `<div class="symbol-legend-row"><i style="width:${44 * Math.sqrt(value / max)}px;height:${44 * Math.sqrt(value / max)}px"></i><span>${formatNumber(value, key)} ${meta.unit}</span></div>`).join("")
      : `<div class="missing-note">此指标暂无可用数据</div>`;
  } else {
    $("#legendItems").innerHTML = info.values.length ? colors.map((color, index) =>
      `<div class="legend-row"><i style="background:${color}"></i><span>${intervalLabel(index, info, key, method)}</span></div>`).join("")
      : `<div class="missing-note">此指标暂无可用数据</div>`;
  }
  const methodName = method === "quantile" ? "分位数" : "等间距";
  const expressionName = (key === app.metric && app.expression === "symbols") ? "比例符号地图" : "分级设色图";
  $("#legendMethod").textContent = expressionName === "比例符号地图"
    ? `${expressionName} · 圆面积 ∝ 数值${app.reverse ? " · 色带反转（对照设色图时生效）" : ""}`
    : `${expressionName} · ${methodName} ${app.bins} 级${app.reverse ? " · 反转色带" : ""}`;
  $("#methodNote").innerHTML = app.expression === "symbols"
    ? "<b>比例符号</b>：不进行分级；圆面积与数值成比例。分级方法在分级设色图或对照视图中生效。"
    : method === "quantile"
    ? "<b>分位数分级</b>：每级包含数量大致相同的省份，适合观察排序；数值区间宽度可能不同。"
    : "<b>等间距分级</b>：每级数值跨度相同，适合解释绝对差异；极端值可能使多数省份集中在少数等级。";
}
function paintSymbolLayer(map, layerRef, symbolRef, key = app.metric) {
  if (symbolRef) map.removeLayer(symbolRef);
  const group = L.layerGroup();
  const max = Math.max(...valuesFor(key), 1);
  app.regions.forEach((region) => {
    const feature = app.featureByCode.get(region.adcode);
    const value = metricValue(region, key);
    const target = feature?.layer;
    if (!target || !Number.isFinite(value)) return;
    const center = target.getBounds().getCenter();
    const marker = L.circleMarker(center, {
      radius: 22 * Math.sqrt(value / max),
      color: "#e4fbff", weight: 1.4,
      fillColor: "#21bad0", fillOpacity: 0.67,
    }).bindTooltip(`${region.name} · ${formatNumber(value, key)} ${metricMeta(key).unit}`);
    marker.on("click", () => selectRegion(region.adcode, false));
    marker.addTo(group);
  });
  group.addTo(map);
  return group;
}
function paintMap() {
  if (!app.geoLayer) return;
  app.geoLayer.setStyle((feature) => styleFeature(feature));
  if (app.symbolLayer) app.map.removeLayer(app.symbolLayer);
  app.symbolLayer = app.expression === "symbols" ? paintSymbolLayer(app.map, app.geoLayer, null) : null;
  renderLegend();
  $("#mapTitle").textContent = `${app.raw.year} 年${metricMeta().label}`;
  $("#mapSub").textContent = `${metricMeta().unit} · ${app.expression === "symbols" ? "比例符号地图" : "分级设色图"} · 点击省份查看数据`;
}
function renderRanking() {
  const rows = app.regions.filter((region) => Number.isFinite(metricValue(region)))
    .sort((a, b) => metricValue(b) - metricValue(a)).slice(0, 10);
  $("#ranking").innerHTML = rows.map((region, index) => `<button class="rankrow ${app.selected === region.adcode ? "selected" : ""}" data-code="${region.adcode}"><span class="num">${String(index + 1).padStart(2, "0")}</span><span>${region.name}</span><strong>${formatNumber(metricValue(region))}</strong></button>`).join("") || `<div class="missing-note">暂无可排名数据</div>`;
  $("#ranking").querySelectorAll("[data-code]").forEach((button) => button.addEventListener("click", () => selectRegion(button.dataset.code)));
}
function renderChart() {
  if (!window.echarts) return;
  if (!app.chart) app.chart = echarts.init($("#chart"));
  const rows = app.regions.filter((region) => Number.isFinite(metricValue(region)))
    .sort((a, b) => metricValue(b) - metricValue(a)).slice(0, 8).reverse();
  app.chart.setOption({
    grid: { left: 42, right: 14, top: 4, bottom: 22 },
    xAxis: { type: "value", axisLabel: { color: "#7891a4", fontSize: 8 }, splitLine: { lineStyle: { color: "#1a3145" } }, axisLine: { show: false } },
    yAxis: { type: "category", data: rows.map((region) => region.name), axisLabel: { color: "#a9bdca", fontSize: 9, color: (value) => app.regions.find((region) => region.name === value)?.adcode === app.selected ? "#5ce0ee" : "#a9bdca" }, axisLine: { show: false }, axisTick: { show: false } },
    series: [{ type: "bar", data: rows.map((region) => ({ value: metricValue(region), itemStyle: { color: region.adcode === app.selected ? "#f1c66b" : "#27a9bf" } })), barWidth: 8, itemStyle: { borderRadius: [0, 4, 4, 0] } }],
    tooltip: { trigger: "axis", formatter: (items) => `${items[0].name}<br>${formatNumber(items[0].value)} ${metricMeta().unit}` },
    backgroundColor: "transparent",
  });
}
function findRegion(query) {
  const normalized = normalizeName(query);
  return app.regions.find((region) => normalizeName(region.name) === normalized
    || (REGION_ALIASES[region.name] || []).some((alias) => normalizeName(alias) === normalized));
}
function searchRegion() {
  const query = $("#search").value.trim();
  if (!query) return;
  const region = findRegion(query);
  if (region) selectRegion(region.adcode);
  else setStatus(`未找到“${query}”，请检查省份简称或全称`, "error");
}
function bindFeatureEvents(feature, layer) {
  const code = codeOf(feature.properties);
  const region = app.byCode.get(code);
  if (!region) return;
  const record = { feature, layer };
  app.featureByCode.set(code, record);
  layer.bindTooltip(region.name, { sticky: true });
  layer.on({
    click: () => {
      app.selected = code;
      L.popup({ maxWidth: 300 }).setLatLng(layer.getBounds().getCenter()).setContent(popupHtml(region)).openOn(app.map);
      renderDetail(region); paintMap(); renderRanking(); renderChart();
      if (app.compareMap) paintCompareMap();
    },
    mouseover: (event) => event.target.setStyle({ weight: 2.2, color: "#d0f3f5" }),
    mouseout: (event) => app.geoLayer.resetStyle(event.target),
  });
}
function createCompareMap() {
  if (app.compareMap) return;
  app.compareMap = L.map("compareMap", { zoomControl: false, attributionControl: false, preferCanvas: true }).setView([35.8, 103.5], 4);
  app.compareLayer = L.geoJSON(app.rawGeo, {
    style: compareBaseStyle,
    onEachFeature: (feature, layer) => bindCompareFeature(feature, layer),
  }).addTo(app.compareMap);
  app.compareMap.fitBounds(app.compareLayer.getBounds(), { padding: [20, 25] });
  app.compareSymbols = paintSymbolLayer(app.compareMap, app.compareLayer, null, app.metric);
  app.map.on("moveend", () => { if (app.compareMap && !app._syncing) { app._syncing = true; app.compareMap.setView(app.map.getCenter(), app.map.getZoom(), { animate: false }); app._syncing = false; } });
  app.compareMap.on("moveend", () => { if (!app._syncing) { app._syncing = true; app.map.setView(app.compareMap.getCenter(), app.compareMap.getZoom(), { animate: false }); app._syncing = false; } });
}
function compareBaseStyle(feature) {
  return { color: app.selected === codeOf(feature.properties) ? "#f2fbff" : "#587f94", weight: app.selected === codeOf(feature.properties) ? 2.2 : 0.7, fillColor: "#10273a", fillOpacity: 0.62 };
}
function bindCompareFeature(feature, layer) {
  const region = app.byCode.get(codeOf(feature.properties));
  if (!region) return;
  layer.bindTooltip(region.name, { sticky: true });
  layer.on("click", () => selectRegion(region.adcode, false));
}
function paintCompareMap() {
  if (!app.compareLayer) return;
  app.compareLayer.setStyle(compareBaseStyle);
  app.compareMap.removeLayer(app.compareSymbols);
  app.compareSymbols = paintSymbolLayer(app.compareMap, app.compareLayer, null, app.metric);
  $("#compareLegend").textContent = `${metricMeta().label} · 同一指标双表达（${metricMeta().unit}）`;
}
function initCities() {
  const cities = [["北京", 39.9, 116.4], ["上海", 31.23, 121.47], ["广州", 23.13, 113.26], ["深圳", 22.54, 114.06], ["成都", 30.57, 104.07], ["武汉", 30.59, 114.3], ["西安", 34.34, 108.94], ["乌鲁木齐", 43.83, 87.62], ["拉萨", 29.65, 91.14], ["沈阳", 41.8, 123.43], ["南京", 32.06, 118.8], ["杭州", 30.27, 120.15], ["重庆", 29.56, 106.55], ["昆明", 25.04, 102.71], ["兰州", 36.06, 103.83]];
  app.cityLayer = L.layerGroup(cities.map(([name, lat, lon]) => L.circleMarker([lat, lon], { radius: 4, color: "#68d5e1", fillColor: "#1d9eb8", fillOpacity: 0.9, weight: 1 }).bindTooltip(name)));
  if ($("#cities").checked) app.cityLayer.addTo(app.map);
}
async function loadData() {
  setStatus("正在读取统计数据…", "loading");
  try {
    app.raw = window.MAPLAB_DATA || await fetch("assets/data.json").then((response) => {
      if (!response.ok) throw new Error(`统计数据请求失败 (${response.status})`);
      return response.json();
    });
  } catch (error) {
    setStatus(`统计数据加载失败：${error.message}`, "error");
    return;
  }
  app.regions = app.raw.regions;
  app.regions.forEach((region) => app.byCode.set(String(region.adcode).padStart(6, "0"), region));
  renderRanking();
  renderChart();
  let geo;
  try {
    if (window.MAPLAB_GEOJSON) geo = window.MAPLAB_GEOJSON;
    else {
      try {
        geo = await fetch("assets/china.json").then((response) => {
          if (!response.ok) throw new Error(`本地边界文件请求失败 (${response.status})`);
          return response.json();
        });
      } catch {
        geo = await fetch(app.raw.boundaries.sourceUrl).then((response) => {
          if (!response.ok) throw new Error(`在线边界数据请求失败 (${response.status})`);
          return response.json();
        });
      }
    }
  } catch (error) {
    setStatus(`省级边界加载失败；排名和图表数据仍可用。${error.message}`, "error");
    return;
  }
  app.rawGeo = geo;
  geo.features.forEach((feature) => {
    const region = app.byCode.get(codeOf(feature.properties));
    if (region && Number.isFinite(region.values.population)) {
      const area = areaKm2(feature.geometry);
      if (area > 0) region.derivedDensity = region.values.population * 10000 / area;
    }
  });
  app.geoLayer = L.geoJSON(geo, { style: styleFeature, onEachFeature: bindFeatureEvents }).addTo(app.map);
  app.map.fitBounds(app.geoLayer.getBounds(), { padding: [25, 40] });
  initCities();
  paintMap(); renderRanking(); renderChart();
  const matched = app.featureByCode.size;
  if (matched < 31) setStatus(`边界已加载；仅匹配到 ${matched}/31 个省级代码，请核对 GeoJSON 版本`, "warning");
  else setStatus(`数据与边界加载完成 · ${matched} 个省级代码匹配 · ${app.raw.year} 年`, "success");
}
function bindControls() {
  document.querySelectorAll(".theme").forEach((button) => button.addEventListener("click", () => {
    $(".theme.active")?.classList.remove("active"); button.classList.add("active"); app.metric = button.dataset.metric;
    paintMap(); renderRanking(); renderChart(); if (app.selected) renderDetail(app.byCode.get(app.selected));
    if (app.compareMap) paintCompareMap();
  }));
  $("#palette").addEventListener("change", (event) => { app.palette = event.target.value; paintMap(); if (app.compareMap) paintCompareMap(); });
  $("#method").addEventListener("change", (event) => { app.method = event.target.value; paintMap(); });
  $("#classes").addEventListener("input", (event) => { app.bins = Number(event.target.value); $("#nval").textContent = app.bins; paintMap(); });
  $("#reverse").addEventListener("change", (event) => { app.reverse = event.target.checked; paintMap(); if (app.compareMap) paintCompareMap(); });
  document.querySelectorAll("[data-expression]").forEach((button) => button.addEventListener("click", () => {
    app.expression = button.dataset.expression;
    document.querySelectorAll("[data-expression]").forEach((item) => item.classList.toggle("active", item === button));
    paintMap();
  }));
  $("#boundaries").addEventListener("change", (event) => {
    app.geoLayer?.eachLayer((layer) => layer.setStyle({ color: event.target.checked ? (app.selected === codeOf(layer.feature.properties) ? "#f2fbff" : "#587f94") : "#213f50", weight: event.target.checked ? 0.8 : 0.35 }));
  });
  $("#cities").addEventListener("change", (event) => {
    if (!app.cityLayer) return;
    if (event.target.checked) app.cityLayer.addTo(app.map); else app.map.removeLayer(app.cityLayer);
  });
  $("#reset").addEventListener("click", () => app.geoLayer && app.map.fitBounds(app.geoLayer.getBounds(), { padding: [25, 40] }));
  $("#searchBtn").addEventListener("click", searchRegion);
  $("#search").addEventListener("keydown", (event) => { if (event.key === "Enter") searchRegion(); });
  $("#fullscreen").addEventListener("click", async () => {
    const target = $(".mapwrap");
    try { if (!document.fullscreenElement) await target.requestFullscreen(); else await document.exitFullscreen(); setTimeout(() => app.map.invalidateSize(), 150); }
    catch { setStatus("全屏功能被浏览器阻止", "warning"); }
  });
  $("#compare").addEventListener("click", () => {
    const enabled = $("#compare").getAttribute("aria-pressed") !== "true";
    $("#compare").setAttribute("aria-pressed", String(enabled));
    $("#compare").classList.toggle("active", enabled);
    $(".mapwrap").classList.toggle("comparing", enabled);
    $("#comparePanel").hidden = !enabled;
    document.querySelectorAll("[data-expression]").forEach((item) => { item.disabled = enabled; });
    if (enabled) {
      app.preCompareExpression = app.expression;
      app.expression = "choropleth";
      createCompareMap(); paintCompareMap(); paintMap();
    } else {
      app.expression = app.preCompareExpression || "choropleth";
      paintMap();
    }
    document.querySelectorAll("[data-expression]").forEach((item) => item.classList.toggle("active", item.dataset.expression === app.expression));
    setTimeout(() => { app.map.invalidateSize(); app.compareMap?.invalidateSize(); }, 120);
  });
  $("#export").addEventListener("click", async () => {
    try {
      const canvas = await html2canvas($(".mapwrap"), { backgroundColor: "#081522", useCORS: true, scale: 2 });
      const link = document.createElement("a"); link.download = `maplab-${app.metric}-${app.raw.year}.png`;
      link.href = canvas.toDataURL("image/png"); link.click();
    } catch { setStatus("导出失败；请检查导出组件是否成功加载", "error"); }
  });
}

app.map = L.map("map", { zoomControl: true, preferCanvas: true }).setView([35.8, 103.5], 4);
L.control.scale({ imperial: false, position: "bottomright" }).addTo(app.map);
bindControls();
loadData().catch((error) => {
  console.error(error);
  setStatus(`地图渲染失败；排名和图表数据仍可用。${error.message}`, "error");
});
window.addEventListener("resize", () => { app.chart?.resize(); app.map.invalidateSize(); app.compareMap?.invalidateSize(); });
