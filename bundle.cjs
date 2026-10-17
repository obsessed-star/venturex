// Üç uygulama dosyasını tek, çevrimdışı açılabilen HTML'ye birleştirir.
const fs = require("node:fs");
const path = require("node:path");
const dir = path.join(__dirname, "dist");
let html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
html = html.replace(
  /<link[^>]*href=["']styles\.css["'][^>]*>/,
  () =>
    "<style>" +
    fs.readFileSync(path.join(dir, "styles.css"), "utf8") +
    "</style>",
);
for (const name of ["engine.js", "app.js"]) {
  const pattern = new RegExp(
    '<script[^>]*src=["\x27]' +
      name.replace(".", "\\.") +
      '["\x27][^>]*>\\s*</script>',
  );
  html = html.replace(
    pattern,
    () =>
      "<script>\n" +
      fs
        .readFileSync(path.join(dir, name), "utf8")
        .replace(/<\/script/gi, "<\\/script") +
      "\n</script>",
  );
}
if (/<(?:script|link)[^>]*(?:src|href)=["'][^"']*\.(?:js|css)["']/.test(html))
  throw new Error("Birleştirilmemiş bir dış kaynak kaldı.");
const destination = path.join(__dirname, "VentureX.html");
fs.writeFileSync(destination, html, "utf8");
console.log(destination);
