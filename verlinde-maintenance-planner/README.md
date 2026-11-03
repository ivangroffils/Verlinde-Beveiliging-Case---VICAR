# Verlinde Maintenance Planner

Operationele onderhoudsopvolging en werkorderplanning met twee pagina's: **Onderhoud** en **Planning**.

## Lokaal starten

Gebruik Node.js 24 en installeer de afhankelijkheden met `npm ci`.

```sh
npm run dev
```

Voor een productieversie: `npm run build` gevolgd door `npm start`.

## Gegevens en sessiegedrag

De acht BuildDesk-exports onder `data/` zijn de enige bron. Bestanden worden uitsluitend server-side gelezen met Papa Parse (UTF-8, puntkomma), getypeerd genormaliseerd en via de gedeelde layout aan de client doorgegeven. De app schrijft niets terug naar CSV en gebruikt geen database, authenticatie, externe API of browseropslag.

Aanmaken, plannen, verplaatsen en afronden bestaan alleen in React-applicatiestatus. Navigatie tussen de twee pagina's behoudt de sessie; herladen herstelt de CSV-toestand. De interface heeft daarom geen prototypebanner.

## Importregels

- Datums: strikt `dd/MM/yyyy`; tijden: strikt `HH:mm`.
- Omgekeerde begin- en eindtijden zijn een legacy-exporteigenschap. `10:00 -> 08:00` wordt `08:00-10:00`, met een informatieve melding. Dit geldt voor geimporteerde planning en uitvoeringsuren. Bronbestanden blijven ongewijzigd.
- Ontbrekende of ongeldige datums/tijden, onbekende resources en ontbrekende werkorders maken een urenrij onbruikbaar. Oorspronkelijke onbruikbare planningsrijen blijven beschikbaar bij Gegevensproblemen. Gekoppelde actieve werkorders zonder andere bruikbare planning worden ongepland; handmatig inplannen maakt nieuwe sessieplanning.
- Gelijke geldige tijden in planning krijgen twee uur duur, bijvoorbeeld `10:00-10:00` naar `10:00-12:00`. De oorspronkelijke tijden blijven in `rawPlanning` beschikbaar, ook na verplaatsen of resizen. Dit is een informatieve normalisatie en maakt geen uitvoeringsuren aan.
- Bestaande overlappende afspraken blijven zichtbaar en gemarkeerd. Geldige importafspraken buiten het werkvenster blijven behouden en krijgen een waarschuwing. Nieuwe afspraken mogen niet overlappen en moeten volledig binnen 08:00-18:00 vallen.
- Gegevensproblemen hebben een ernst: informatie voor genormaliseerde tijdvolgorde, waarschuwingen voor ontbrekende/tegenstrijdige domeingegevens, fouten voor onleesbare bestanden of ongeldige CSV-schema's.
- Alleen `MS_HDR.nr -> WO_OBJ.fiche -> WO_OBJ.werkbon -> WO_HDR.nr` bepaalt fiche/werkorderkoppelingen. `WO_HDR.fiche` wordt volledig genegeerd en is geen vereiste importkolom. Werkorders zonder WO_OBJ blijven in Planning beschikbaar zonder gekoppelde installatie. Onbekende fiches/werkorders in WO_OBJ krijgen een gegevensmelding en worden niet gekoppeld. Expliciete geldige installatiekoppelingen blijven behouden, ook bij afwijkende klanten. Er worden geen koppelingen of onderhoudsdatums geraden.

Onderhoudsurgentie gebruikt uitsluitend `volgende`, vergeleken met de actuele datum in Europe/Brussels: verstreken, vandaag t/m 30 dagen vooruit, later, of ontbrekend. Bekende intervallen worden genormaliseerd; ambigue waarden blijven zichtbaar.

`Completed` en `Invoiced` zijn gesloten. `Planned`, `Implemented`, `Verified` en onbekende statussen blijven actief. Een actieve werkorder is alleen ingepland als deze bruikbare planning heeft.

## Planning en afronding

Maandag t/m zondag, 08:00-18:00, stappen van 30 minuten, met volledige resourcenamen. Nieuwe afspraken duren twee uur; verplaatsen behoudt de duur, ook als een importduur geen veelvoud van 30 minuten is. De nieuwe starttijd volgt het 30-minutenraster. Volledige kaarten en blokken zijn sleepbaar; Enter opent details en spatie/pijltjestoetsen bedienen de verplaatsing. Aanpakken in een kalenderblok behoudt de positie van het aangrijppunt en de duur. De onderste rand wijzigt alleen de eindtijd; die rand is ook met pijl omhoog/omlaag te bedienen. Live tijdlabels en doelmarkeringen tonen conflicten voordat een wijziging wordt toegepast. Slepen, het invoerformulier en resize gebruiken dezelfde validatie. Functietitels bepalen geen beschikbaarheid.

Afronden gebruikt bestaande uitvoering of registreert geldige geplande uren als sessie-uitvoering en verwijdert de werkorder uit actieve planning. Onderhoudsdatums worden hierdoor niet automatisch gewijzigd.

## Onderhoudsoverzicht

Het dashboard heeft precies twee onafhankelijke statusdimensies. Urgentie gebruikt uitsluitend MS_HDR.volgende en de Brusselse kalenderdatum: Achterstallig, Binnenkort (vandaag t/m 30 dagen), Op schema of Onbekend. MS_HDR.laatste en frequentie blijven context; datums worden nooit gereconstrueerd of automatisch gewijzigd.

Werkorderopvolging gebruikt uitsluitend de WO_OBJ-keten en WO_OBJ.soort = Onderhoud. Alleen administratief actieve importwerkorders (Planned, Implemented, Verified) en nieuw aangemaakte sessiewerkorders tellen mee. Bij meerdere actieve werkorders wint de nieuwste geldige aanmaakdatum, met natuurlijke werkordernummervolgorde als vaste terugval. Documentdatums, gesloten werkorders en historische planning beïnvloeden deze selectie niet.

De gedeelde selector `createMaintenanceSelectors(data).getMaintenanceAction(sheetId)` bepaalt de opvolging in vaste volgorde:

1. Geregistreerde uitvoering: Afsluiting controleren.
2. Bruikbare toekomstige afspraak: Gepland.
3. Actieve WO zonder uitvoering of toekomstige afspraak: Te plannen.
4. Geen actieve onderhoudswerkorder: Te starten.

Er worden geen onderhoudscycli gereconstrueerd. Afronden sluit de werkorder en verwijdert deze uit de actieve selectie; zonder andere actieve WO wordt de opvolging weer Te starten. De onderhoudsurgentie blijft gebaseerd op de bron. Gesloten historie blokkeert geen nieuwe onderhoudswerkorder. Bestaande uitvoering wordt bij afronden niet gedupliceerd; zonder uitvoering vereist afronden bruikbare planning om sessie-uitvoering vast te leggen.

Het overzicht toont een compacte tabel met beide statusbadges, horizontaal scrollen op kleinere schermen en één actie: Werkorder maken, Plannen, Afspraak bekijken of Afsluiting controleren. Vier klikbare tellers filteren op Achterstallig, Binnenkort, Te plannen en Gepland. Een selectiefilter houdt onder andere Op schema, Onbekend en Afsluiting controleren bereikbaar. Alle acht kolommen ondersteunen oplopend en aflopend sorteren. Prioriteit is de standaard: achterstallig (te starten, te plannen, afsluiting, gepland), binnenkort (te starten, te plannen), onbekend (te starten, te plannen), binnenkort afsluiting, onbekend afsluiting, binnenkort gepland, onbekend gepland en op schema (afsluiting, te plannen, gepland, te starten). Binnen elke groep komen de oudste volgende datums eerst, ontbrekende datums achteraan en klantnaam als vaste terugval. Filters en sortering blijven bij navigatie behouden.

De detaildrawer behoudt alle canoniek gekoppelde werkorders, inclusief herstellingen en garantie. Deze historie staat chronologisch (nieuwste eerst), met interventietype, bronstatus, planning en uitvoering afzonderlijk. Tegenstrijdige gegevens staan als secundaire gegevensmeldingen in de drawer en in Gegevensproblemen; ze vervangen de twee hoofdstatussen niet.

Plannen en Afspraak bekijken gebruiken `/planning?wo=WERKORDERNUMMER`. Een toekomstige afspraak opent in de juiste week/resource; een WO met alleen oude afspraken opent de huidige week met de juiste WO geselecteerd en behoudt het bestaande slot om bewust te verplaatsen. Klikken op een beschikbaar tijdvak en drag-and-drop blijven dezelfde validatie gebruiken. Historische afspraken van gesloten werkorders blijven alleen-lezen en blokkeren actieve afspraken niet.

Regressies op de echte export: Hoeve Sabbe (1004) en Verschuere Katrien (1062) zijn Achterstallig + Afsluiting controleren. De Leie (1197) is Achterstallig + Gepland, met WB2026-0248 op 16/11/2026 van 08:00–16:00 bij Wout Vanhoutte. Lieve Deprez (1089) is Te plannen via de actieve WB2025-0163; nieuwer afgerond onderhoud blijft historie. Deze uitkomsten volgen uit algemene regels zonder fiche-specifieke uitzonderingen.

## Controles

```sh
npm run lint -- --max-warnings=0
npm run typecheck
npm test
npm run build
```

`tests/domain.test.ts` test parsing, normalisatie, de echte exports, planning en sessiemutaties. De bron bevat 193 onderhoudsfiches, 561 werkorders en vijf resources. Van de 521 planningsrijen hebben er 65 omgekeerde tijden en 24 nulduur.

Voor de echte browserflow, start de productieversie op poort 3100 en voer `node tests/browser-smoke.mjs` uit. De controle gebruikt lokaal Edge via CDP, test slepen, conflicten, toetsenbord, afronden, herladen en responsive weergaven. `SMOKE_BROWSER` en `SMOKE_URL` zijn instelbaar. Schermafbeeldingen verschijnen in de genegeerde map `artifacts/`.
