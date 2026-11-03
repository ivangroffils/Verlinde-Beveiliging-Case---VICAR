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

Afronden vereist geldige planning, registreert de geplande uren als uitvoering en verwijdert de werkorder uit actieve planning. Onderhoudsdatums worden hierdoor niet automatisch gewijzigd.

## Onderhoudsoverzicht

De kolom Afspraak toont precies één bruikbare afspraak uit expliciet gekoppelde werkorders: eerst de dichtstbijzijnde toekomstige start, anders de meest recente start uit het verleden. De referentie is de Brusselse datum/tijd bij laden. Geplande afspraken blijven na afronden bewaard; de gesloten status verwijdert ze uit de actieve planner. Uitgevoerde uren zijn een aparte stroom en worden nooit gebruikt om een afspraak te verzinnen.

De gedeelde selectorlaag gebruikt indexes op werkordernummer, WO_OBJ-fiche, resourcecode en uren per werkorder. React-componenten gebruiken deze selectors voor de relatieketen. Tijdelijke werkorders krijgen een expliciet WO_OBJ-record met bron `session` in het geheugen; de CSV blijft ongewijzigd.

Alle acht kolommen ondersteunen oplopend, aflopend en terug naar de standaardsortering. Ontbrekende datums en afspraken blijven achteraan. Status volgt urgentie; documentnummers gebruiken natuurlijke sortering. Sortering en filters blijven bij navigatie behouden.

## Controles

```sh
npm run lint -- --max-warnings=0
npm run typecheck
npm test
npm run build
```

`tests/domain.test.ts` test parsing, normalisatie, de echte exports, planning en sessiemutaties. De bron bevat 193 onderhoudsfiches, 561 werkorders en vijf resources. Van de 521 planningsrijen hebben er 65 omgekeerde tijden en 24 nulduur.

Voor de echte browserflow, start de productieversie op poort 3100 en voer `node tests/browser-smoke.mjs` uit. De controle gebruikt lokaal Edge via CDP, test slepen, conflicten, toetsenbord, afronden, herladen en responsive weergaven. `SMOKE_BROWSER` en `SMOKE_URL` zijn instelbaar. Schermafbeeldingen verschijnen in de genegeerde map `artifacts/`.
