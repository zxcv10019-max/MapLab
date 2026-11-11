# MapLab 专题地图实验室

在现有深蓝色界面基础上迭代的省级专题地图课堂原型。技术栈为 HTML、CSS、JavaScript、Leaflet 和 ECharts。

## 运行

### 单文件演示

双击 `outputs/MapLab.html`。样式、统计数据、行政区 GeoJSON 和应用代码内嵌在该文件，不需要本地服务器；Leaflet、ECharts 和 html2canvas 仍需联网加载。

### 项目开发模式

1. 双击 `start-maplab.cmd`，保持命令窗口打开。
2. 浏览器访问 `http://localhost:8000`。
3. `index.html` 会加载 `style.css`、`app.js`；JSON 可放在 `assets/` 目录，也兼容仓库根目录。

## 目录

- `index.html`：项目模式主页面及地图工具控件。
- `style.css`：深蓝色科技风布局及图层/图例/对照样式。
- `app.js`：数据读取、地图表现、搜索、排名、图表、对照与导出交互。
- `assets/data.json`：2024 统计数据、单位、来源、口径、核验状态和 6 位省级行政区划代码。
- `assets/china.json`：省级行政区 GeoJSON，随站点部署，不依赖访客能否连接第三方边界服务器。应用也兼容把 `data.json` 与 `china.json` 放在仓库根目录。
- `outputs/MapLab.html`：内嵌 CSS、数据与 JavaScript 的直接打开版。
- `scripts/build-single.cjs`：从项目源码重建单档版。
- `tests/smoke-maplab.cjs`：不依赖第三方测试框架的交互冒烟测试。
- `server.js` / `start-maplab.cmd`：项目模式本地静态服务器。

## 地图功能

- 保留中国省级地图缩放、平移、复位、比例尺、行政区边界和城市点位开关。
- GDP、常住人口、人口密度、城镇化率主题；按行政区划代码关联边界和统计记录。
- 分级设色图与比例符号图切换。比例符号的圆面积按数值比例缩放。
- 深海蓝、青绿、琥珀色带及色带反转；分位数/等间距分级、3–7 级调整。
- 图例显示每个等级的闭开区间、单位和分级方法；数据缺失时明确显示。
- 点击省份查看年份、数值、单位、来源、统计口径及核验状态；排名可点击定位并同步突出图表。
- 省份简称/全称搜索、地图全屏、同一指标分级设色与比例符号并排对照、PNG 导出。
- 地图知识卡解释分级设色图、比例符号、分位数和等间距方法。

## 数据与核验状态

统计数据范围为中国大陆 31 个省级行政区，年份 2024。每条记录使用 GB/T 行政区划代码关联，属性值保留于 `assets/data.json`。

- GDP：亿元，来源为[聚汇数据汇总的省级公开值](https://gdp.gotohui.com/topic-4615)。该页面列值尚未逐省与最新官方公报或年鉴复核，因此 JSON 标记为“待逐省复核”。不同发布日期或后续统计修订可能改变数值。
- 年末常住人口：万人，来源为[聚汇数据汇总的省级公开值](https://population.gotohui.com/topic-4861)。国家统计局人口篇说明 2024 年省级人口为年度人口变动抽样调查推算数据，见[统计年鉴人口篇说明](https://www.stats.gov.cn/sj/ndsj/2025/html/sm02.htm)。本文件明确说明仍应核对省级公报的时点和修订。
- 城镇化率：百分比，来源为[区域经济资料公开表](https://lecondata.com/ML18/Sheet7_2024%E5%B9%B4%E5%9F%8E%E9%95%87%E5%8C%96%E7%8E%87.html)。尚未逐省和官方统计公报复核，数据元信息已标注。
- 人口密度：人/km²，由常住人口乘 10,000 除以 GeoJSON 球面几何面积计算；这是软件推算值，不是官方公布的人口密度，边界简化/海岛范围可能造成偏差。
- 省界：随项目提供的 `assets/china.json`，源自 [DataV 行政区划 GeoJSON 镜像](https://github.com/NetworkSecurityVision/geojson-china/blob/master/data/100000_full.json)，通过 `adcode` 与统计数据关联。文件内 35 个边界要素中，31 个与项目的 31 个省级统计代码实际匹配。公开部署前仍应检查数据许可和版本。

可核验来源不足的指标不作为“官方核实值”展示。GDP、人口和城镇化率保留可追溯来源并显示核验说明；不对缺值补造数据。

## 测试

在项目根目录运行：

```text
node --check app.js
node --check tests/smoke-maplab.cjs
node tests/smoke-maplab.cjs
$env:ROOT_JSON="1"
node tests/smoke-maplab.cjs
Remove-Item Env:ROOT_JSON
$env:FAIL_BOUNDARY="1"
node tests/smoke-maplab.cjs
Remove-Item Env:FAIL_BOUNDARY
node scripts/build-single.cjs
```

冒烟测试读取项目实际省级 GeoJSON 几何，验证 31 个行政区代码关联、原有专题切换/排名/图表/省份弹窗、分级区间、色带反转、比例符号、全称搜索、表达对照及 PNG 导出按钮调用。数据结构另行验证年份、单位、来源、核验状态和代码唯一性。

另有失败路径测试会模拟边界网络不可达，确认排名和图表仍正常显示。GeoJSON 现已本地打包，Leaflet、ECharts 与 html2canvas 仍从 CDN 加载；若访客网络屏蔽 CDN，仍需将这些库也改为本地资源。发布 GitHub Pages 时务必一并上传 `index.html`、`style.css`、`app.js`、整个 `assets/` 目录（尤其是 `china.json`）及 `outputs/MapLab.html`。





