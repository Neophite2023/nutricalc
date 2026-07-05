# NutriCalc

Lokalna PWA aplikacia na archiv jedal a vypocet kalorii z lokalnej databazy potravin. Bezi staticky, preto je vhodna na GitHub Pages. Osobne data aj importovana databaza zostavaju v prehliadaci v IndexedDB.

## Spustenie

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

Vystup pre GitHub Pages je v `dist/`.

## Mobil

Na rychly test v mobile cez rovnaku Wi-Fi siet:

```bash
npm run mobile
```

V telefone otvor adresu v tvare `http://IP_ADRESA_PC:5173/`. IP adresu PC zistis vo Windows cez `ipconfig`.

Na bezne pouzivanie v mobile pouzi GitHub Pages, pretoze bezi cez HTTPS a prehliadac potom vie aplikaciu nainstalovat ako PWA. Projekt obsahuje GitHub Actions workflow `.github/workflows/deploy.yml`, ktory po pushi do vetvy `main` zostavi `dist/` a nasadi ho na GitHub Pages.

Po otvoreni GitHub Pages URL v mobile:

- Android Chrome: menu s tromi bodkami -> `Pridat na plochu` alebo `Instalovat aplikaciu`
- iPhone Safari: zdielat -> `Pridat na plochu`

Data su lokalne pre kazde zariadenie. Na mobile preto znova importuj CSV databazu potravin alebo prenes archiv cez `Nastavenia` -> export/import archivu.

## Import potravin

V aplikacii otvor `Import dat` a nahraj CSV alebo TSV export. Importer hlada hlavne tieto stlpce:

- kod potraviny
- nazov potraviny
- energia v kcal alebo kJ
- bielkoviny, tuky, sacharidy, cukry, vlaknina, sol a dalsie nutrienty

Datu NutriDatabaze.cz verejne nepribaluje tento projekt automaticky. Export pouzi lokalne v sulade s licencnymi podmienkami zdroja.

## Archiv jedal

Pri ulozeni jedla sa do zaznamu uklada aj snapshot nutricnych hodnot. Stare jedla preto zostanu vypocitane z hodnot, ktore platili v case ulozenia.
