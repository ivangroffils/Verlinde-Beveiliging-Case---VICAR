# Verlinde Beveiliging - Case

## Inhoudstafel

1. [Context](#1-context)
2. [Probleemstelling](#2-probleemstelling)
3. [Begrijpen – huidige werking](#3-begrijpen--huidige-werking)
4. [Waar loopt het vandaag mis?](#4-waar-loopt-het-vandaag-mis)
5. [Aannames](#5-aannames)
6. [Vragen die ik aan Dirk zou stellen](#6-vragen-die-ik-aan-dirk-zou-stellen)
7. [Ontwerpen – gewenste werking](#7-ontwerpen--gewenste-werking)
8. [Bouwen – scope van de oplossing](#8-bouwen--scope-van-de-oplossing)
9. [Beperkingen](#9-beperkingen)

---

## 1. Context

Verlinde Beveiliging is een installateur die onder andere alarmsystemen, branddetectie, camera’s en toegangscontrole plaatst en onderhoudt.

Het bedrijf werkt vandaag met BuildDesk Pro.

De opdracht bestaat uit drie delen:

- **Begrijpen** hoe onderhoud vandaag wordt opgevolgd en ingepland.
- **Ontwerpen** van een betere manier van werken voor Dirk en de techniekers.
- **Bouwen** van een werkende versie op basis van de beschikbare exportdata.

---

## 2. Probleemstelling

Dirk omschrijft het probleem als volgt:

> “Ik weet nooit welk onderhoud eraan komt. Brand moet elk jaar, en ik ben bang dat we klanten vergeten. En als ik dan iets wil inplannen, ben ik er een eeuwigheid mee bezig.”

De case draait daarom voor mij rond twee kernproblemen:

1. **Onderhoud tijdig detecteren**
2. **Onderhoud efficiënt inplannen**

---

## 3. Begrijpen – huidige werking

### 3.1 Management Sheets

De Management Sheets bevatten de gegevens van een installatie bij een klant.

Belangrijke informatie:

- klant
- site
- type installatie
- componenten
- laatste onderhoud
- volgende onderhoud
- onderhoudsinterval
- contractgegevens

Onderhoudsinformatie bevindt zich vooral in het tabblad **Svc**.

Belangrijke velden:

- `Interval`
- `Last exec.`
- `Next exec.`

### 3.2 Onderhoud controleren

In de standaardlijst van Management Sheets zijn de belangrijkste onderhoudsvelden niet direct zichtbaar.

Mijn aanname voor deze case is daarom dat Dirk vandaag afzonderlijke fiches opent om te controleren welk onderhoud eraan komt.

### 3.3 Een WO aanmaken

Vanuit een Management Sheet kan Dirk via:

`Actions → Create doc → WO`

een werkbon aanmaken.

Daarna kiest hij een template, bijvoorbeeld:

`WB-ONDH-BRAND`

voor onderhoud aan branddetectie.

De nieuwe WO neemt automatisch gegevens over zoals:

- klant
- site
- gekoppelde installatie
- omschrijving

### 3.4 Inplannen

Een WO kan worden ingepland via het tabblad **Hrs**.

Dirk moet daar manueel invullen:

- datum
- resource / technieker
- startuur
- einduur

De beschikbare techniekers worden weergegeven als interne resourcecodes.

Om te bepalen wanneer hij een WO kan inplannen, moet Dirk eerst zelf in de agenda bekijken wanneer een technieker vrij is.

### 3.5 Resources

Onder `LIB > Resources` staat de lijst van beschikbare medewerkers en resources die gebruikt worden bij het plannen van werkbonnen.

| Res. | Naam | Class |
|---|---|---|
| TDC | Tom De Coninck | RES-T1 |
| WVH | Wout Vanhoutte | RES-T1 |
| JMS | Jens Maes | RES-T2 (PT) |
| DV | Dirk Verlinde | ADM/MGR |
| BRT | Brandtec (onderaannemer) | EXT |

De resourcecode wordt gebruikt bij de planning van een WO.

De `Class` lijkt het type resource aan te geven:
- `RES-T1` / `RES-T2` = techniekerklassen
- `PT` = vermoedelijk parttime
- `ADM/MGR` = administratie/management
- `EXT` = externe resource / onderaannemer

### 3.6 Uitvoering en afsluiting

Na uitvoering worden de effectieve uren geregistreerd.

De uitvoering en de status van de WO lijken echter aparte stappen te zijn.

Een uitgevoerde WO kan daardoor nog open blijven staan wanneer deze niet afzonderlijk als **Completed** wordt gemarkeerd.

---

## 4. Waar loopt het vandaag mis?

### 4.1 Geen centraal onderhoudsoverzicht

Dirk ziet niet onmiddellijk welk onderhoud eraan komt.

Onderhoudsgegevens bevinden zich in individuele fiches en zijn niet duidelijk zichtbaar in het standaardoverzicht.

Gevolg:

- installaties kunnen worden overgeslagen
- onderhoud kan te laat gebeuren
- klanten kunnen vergeten worden

### 4.2 Afhankelijk van correcte data

Wanneer `Interval` of `Next exec.` ontbreekt of fout is ingevuld, wordt opvolging moeilijker.

Het systeem lijkt weinig ondersteuning te bieden om ontbrekende onderhoudsdata te signaleren.

### 4.3 Planning is sterk manueel

Voor elke WO moet Dirk zelf:

- beschikbare techniekers controleren
- een vrij tijdstip zoeken
- dit tijdstip onthouden
- teruggaan naar de WO
- datum invullen
- technieker selecteren
- startuur invullen
- einduur invullen

Dit kost tijd en verhoogt de kans op fouten.

### 4.4 Geen goed overzicht tijdens het plannen

Tijdens het ingeven van een planning ziet Dirk niet rechtstreeks de volledige agenda.

Hij moet dus tussen verschillende schermen wisselen.

Hierdoor gaat context verloren.

### 4.5 Gevoelig voor invoerfouten

Verschillende velden worden manueel ingegeven.

Mogelijke fouten:

- verkeerde datum
- verkeerd start- of einduur
- verkeerde technieker
- typfouten
- overlappende planning

### 4.6 Filters worden gereset

Wanneer Dirk terugkeert naar bijvoorbeeld **DOC > WO**, worden filters opnieuw ingesteld.

Hij moet vervolgens opnieuw zoeken naar de juiste klant of WO.

### 4.7 Moeilijk herplannen

Bij ziekte, annuleringen of sluitingsdagen moet Dirk zelf bepalen:

- welke afspraken geraakt worden
- welke technieker nog beschikbaar is
- waar een nieuw tijdslot beschikbaar is

Daarna moeten WO’s afzonderlijk opnieuw worden aangepast.

### 4.8 Statusafhandeling is een aparte stap

Een WO kan uitgevoerd zijn, maar administratief nog openstaan.

Dit kan leiden tot:

- foutieve openstaande werkbonnen
- onduidelijke rapportering
- verkeerde opvolging

---

## 5. Aannames

Omdat niet alle bedrijfsregels volledig uit het systeem of de data af te leiden zijn, maak ik voor deze case enkele aannames.

### Aanname 1

Dirk heeft vandaag geen centraal overzicht van aankomend onderhoud en controleert Management Sheets afzonderlijk.

### Aanname 2

`Next exec.` is de belangrijkste datum om te bepalen wanneer onderhoud moet gebeuren.

### Aanname 3

Brandinstallaties moeten jaarlijks worden onderhouden.

### Aanname 4

De bestaande WO’s en Management Sheets bevatten voldoende data om een onderhoudsoverzicht en planning te bouwen.

### Aanname 5

Een WO die ingepland moet worden, kan als aparte planningskaart worden weergegeven.

---

## 6. Vragen die ik aan Dirk zou stellen

In een echte klantcontext zou ik deze aannames eerst valideren.

Belangrijke vragen:

- Hoe controleer je vandaag welk onderhoud eraan komt?
- Open je daarvoor Management Sheets afzonderlijk?
- Welke datum gebruik je als belangrijkste onderhoudsdatum?
- Wat doe je wanneer `Next exec.` ontbreekt?
- Geldt jaarlijks onderhoud voor alle brandinstallaties?
- Hoe ver op voorhand wil je onderhoud zien aankomen?
- Hoe bepaal je welke technieker een onderhoud uitvoert?
- Hebben techniekers verschillende specialisaties?
- Hoe lang duurt een standaard onderhoud?
- Hoe ga je vandaag om met ziekte of onverwachte afwezigheid?
- Wanneer beschouw je een WO als volledig afgewerkt?
- Moet een afgeronde WO automatisch een nieuwe onderhoudsdatum bepalen?

---

## 7. Ontwerpen – gewenste werking

De oplossing focust op dezelfde twee problemen die Dirk zelf aangeeft.

### 7.1 Centraal onderhoudsoverzicht

Dirk moet in één scherm kunnen zien welk onderhoud eraan komt.

Per onderhoud wil ik onder andere tonen:

- klant
- installatie
- type installatie
- volgende onderhoudsdatum
- status
- urgentie

Mogelijke categorieën:

- achterstallig
- komende 30 dagen
- komende 60 dagen
- komende 90 dagen

Hierdoor hoeft Dirk niet langer elke Management Sheet afzonderlijk te openen.

### 7.2 Visuele planning

De planning wordt opgebouwd rond een duidelijk agenda-overzicht.

Concept:

**Links:** nog in te plannen onderhoud / WO’s  
**Rechts:** agenda van de techniekers

Dirk moet een WO vanuit de linker lijst rechtstreeks naar een vrije plaats in de agenda kunnen slepen.

### 7.3 Drag-and-drop

Bij het plaatsen van een WO in de agenda worden automatisch bepaald:

- datum
- technieker
- startuur
- einduur

Hierdoor verdwijnt een groot deel van de manuele invoer.

### 7.4 Herplannen

Een afspraak moet eenvoudig naar:

- een andere dag
- een ander tijdstip
- een andere technieker

kunnen worden versleept.

Dit maakt het eenvoudiger om te reageren op ziekte, annuleringen of andere wijzigingen.

### 7.5 Validatie

De planning moet fouten zoveel mogelijk voorkomen.

Bijvoorbeeld:

- geen overlappende afspraken
- geen einduur vóór startuur
- waarschuwing wanneer een technieker niet beschikbaar is
- duidelijke aanduiding van achterstallig onderhoud

---

## 8. Bouwen – scope van de oplossing

De oplossing wordt gebouwd op basis van de beschikbare CSV-export.

De eerste versie focust op:

### Onderhoudsoverzicht

- installaties tonen
- onderhoudsdata tonen
- achterstallig onderhoud detecteren
- aankomend onderhoud sorteren
- filteren op onderhoudsdatum en type

### Planning

- WO’s / onderhouden tonen die nog ingepland moeten worden
- agenda per technieker tonen
- WO naar agenda slepen
- datum, technieker en tijd automatisch invullen
- geplande WO verplaatsen

De kernflow wordt:

`Onderhoud detecteren → WO / onderhoud selecteren → inplannen → visueel beheren`

---

## 9. Beperkingen

Het doel van deze case is niet om BuildDesk volledig te vervangen.

De oplossing focust specifiek op de problemen die Dirk benoemt:

- niet weten welk onderhoud eraan komt
- te veel tijd verliezen bij het plannen

Buiten scope vallen voorlopig:

- facturatie
- offertes
- voorraadbeheer
- volledige contractadministratie
- mobiele technieker-app
- financiële verwerking
- volledige vervanging van BuildDesk

Daarnaast worden bepaalde bedrijfsregels gebaseerd op aannames.

In een echte implementatie zouden deze eerst met Dirk en de techniekers gevalideerd worden.