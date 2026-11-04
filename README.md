# Verlinde Maintenance Planner

Een interactieve webapplicatie ontwikkeld voor de **VICAR Forward Deployed Engineer-case**. De applicatie helpt Verlinde Beveiliging om onderhoud op te volgen en werkbonnen efficiënter in te plannen, op basis van CSV-exports uit BuildDesk Pro.

**Live demo:** https://verlinde-beveiliging-case-vicar.vercel.app

## 1. Technische stack

- **Frontend:** Next.js (App Router), React, TypeScript
- **Styling:** Tailwind CSS, Lucide Icons
- **Planning:** dnd-kit (drag-and-drop)
- **Dataverwerking:** Papa Parse (CSV), date-fns (datums)
- **Hosting:** Vercel, gekoppeld aan GitHub

De applicatie leest acht CSV-exports in en combineert installatiegegevens, klanten, werkbonnen, geplande uren en uitgevoerde uren.

## 2. Werking

De applicatie bestaat uit twee onderdelen:

**Onderhoud**
- Centraal overzicht met KPI's, zoekfunctie, filters en prioriteitssortering.
- Installaties groeperen per categorie (inbraak, branddetectie, camera en toegangscontrole).
- Werkbonnen aanmaken, inplannen en opvolgen.
- Volledige werkbonhistoriek raadplegen, inclusief geplande en uitgevoerde uren.

**Planning**
- Interactieve weekagenda per technieker.
- Werkbonnen inplannen via klikken of drag-and-drop.
- Afspraken verplaatsen en de tijdsduur aanpassen.
- Conflictcontrole bij overlappende afspraken.
- Rechtstreeks navigeren vanuit het onderhoudsoverzicht naar een werkbon of afspraak.

## 3. Businessregels en labels

Per installatie worden twee **onafhankelijke statussen** berekend.

### Onderhoudsurgentie

Gebaseerd op de volgende onderhoudsdatum (`MS_HDR.volgende`):

| Label | Betekenis |
|---|---|
| Achterstallig | Onderhoudsdatum ligt in het verleden |
| Binnenkort | Onderhoud binnen 30 dagen |
| Op schema | Onderhoud over meer dan 30 dagen |
| Onbekend | Onderhoudsdatum ontbreekt of is ongeldig |

### Werkbonopvolging

Gebaseerd op gekoppelde onderhoudswerkbonnen en hun planning/uitvoering:

| Label | Betekenis |
|---|---|
| Te starten | Geen actieve onderhoudswerkbon |
| Te plannen | Actieve WO zonder toekomstige afspraak of uitvoering |
| Gepland | Actieve WO met toekomstige afspraak |
| Afsluiting controleren | Uitvoering geregistreerd, WO administratief nog open |

Werkbonnen worden uitsluitend via `MS_HDR → WO_OBJ → WO_HDR` aan installaties gekoppeld. Geplande uren komen uit `WO_HRS_PL` en uitvoeringen uit `WO_HRS_EX`.

Een uitgevoerde of geplande werkbon wijzigt de onderhoudsurgentie niet automatisch.

## 4. Beperkingen

- De CSV-bestanden vormen de oorspronkelijke databron.
- Wijzigingen blijven tijdelijk in het geheugen en verdwijnen na herladen.
- Er is geen database of terugkoppeling naar BuildDesk Pro.
- Ontbrekende onderhoudsdatums worden niet automatisch berekend of gecorrigeerd.
- Facturatie, voorraadbeheer en overige ERP-functionaliteiten vallen buiten de scope.

## 5. Tests en validatie

Op **4 november 2026** zijn vijf scenario's functioneel getest.

| Test | Resultaat |
|---|---|
| Achterstallig onderhoud met geregistreerde uitvoering (Hoeve Sabbe) | Geslaagd |
| Achterstallig onderhoud met toekomstige afspraak (Dierenartsenpraktijk De Leie) | Geslaagd |
| Achterstallig onderhoud zonder werkbon (Peter Callens) | Geslaagd |
| Zoeken en werkbonhistoriek raadplegen | Geslaagd |
| Werkbon inplannen via drag-and-drop en conflictcontrole | Geslaagd |

**Eindresultaat: 5/5 tests geslaagd.**

De tests bevestigen de belangrijkste statusberekeningen, historische gegevensweergave en planningsworkflows. Dit is een gerichte functionele validatie, geen volledige regressietest.


### AI-gebruik

Tijdens de ontwikkeling heb ik AI (Codex/ChatGPT) gebruikt als ondersteuning bij het programmeren, refactoren en testen. Ik heb zelf het bestaande ERP onderzocht, de functionele keuzes en businessregels bepaald en de belangrijkste workflows gecontroleerd aan de hand van de CSV-exports. Vijf concrete testscenario's zijn succesvol gevalideerd.

---

**Doel:** de bestaande ERP-gegevens omzetten naar een overzichtelijke en actiegerichte workflow, zonder het volledige systeem te vervangen.