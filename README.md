# Mission Galaxy 90°/180° — gratis Spark-versie

Website: https://intunez.github.io/Mission-Galaxy-90-180-/

## Geen betaalkaart of betaalde server

De online wedstrijd gebruikt Firebase Authentication (anoniem) en Realtime Database op het **Spark-plan** van het eigen project `mission-galaxy-3d247`. Cloud Functions, Cloud Run, Firebase Storage en andere betaalde diensten worden niet aangeroepen. `firebase.json` bevat uitsluitend een databaseconfiguratie. Hosting, afbeeldingen en de aangeleverde muziekvideo blijven op GitHub Pages.

Spark heeft gratis gebruikslimieten: maximaal 100 gelijktijdige databaseverbindingen, 1 GB opgeslagen gegevens en 10 GB datadownload per maand. Eén wedstrijd met 21 teams en een leerkracht gebruikt circa 22 databaseverbindingen. Meerdere tabbladen tellen apart. Bij het bereiken van een limiet kan Firebase de dienst beperken; het spel schakelt niet zelf over naar Blaze. Houd het project op Spark en koppel geen factureringsaccount.

Officiële grenzen: https://firebase.google.com/pricing

## Spel

- Vrij oefenen en tijdchallenge met 24 kaarten, 12 paren, 6×4 indeling, 30 s voorvertoning, 4,4 s zicht bij een juist paar en 2 s bij een fout paar en lokale persoonlijke records.
- Lokale teamwedstrijd op één toestel of online teams op afzonderlijke toestellen: maximaal 21 teams, willekeurige volgorde, vijf beurten per team, 15 s per selectieronde, +5/−1 met minimum nul, zo nodig nieuwe borden met een nieuwe voorvertoning.
- Afzonderlijke astronauten, race, zichtbare lancering en val door het luik, beheer, pauze/hervatten, podium, vuurwerk en gelijke rang bij gelijke score.
- Eén MP4 met geluid, continu herhaald naast de kaarten, te vergroten, met bewaard volume en dempen. De oorspronkelijke MP3 blijft bewaard maar wordt niet gelijktijdig afgespeeld.

## Vertrouwd spelleiderstoestel

De leerkracht is de centrale spelleider. Dat toestel moet tijdens de online wedstrijd open, zichtbaar en verbonden blijven. Het berekent scores en beurtvolgorde volgens dezelfde geteste engine als de lokale modus. Alleen de geauthenticeerde eigenaar mag de private wedstrijdstaat en het publieke bord bijwerken.

Leerlingen mogen uitsluitend een gevalideerd deelnameverzoek indienen en, tijdens hun eigen actieve beurt, een kaartkeuze opsturen. De Firebase-beveiligingsregels controleren identiteit, actuele beurt, bordversie, deadline, kaartindex, gevonden kaarten, aanwezigheid van de leerkracht en toegestane velden. Scores, rangorde, teams en status zijn voor leerlingen niet schrijfbaar.

Bij leerkrachtverlies blokkeren de regels verdere keuzes op basis van aanwezigheid en een lease van 12 s. Na terugkeer pauzeert het spelleiderstoestel; de leerkracht moet bewust hervatten. Teams behouden hun Firebase-identiteit op hetzelfde toestel en krijgen hun punten terug na een korte onderbreking.

De geheime herstelcode bevat 24 willekeurige bytes en wordt standaard verborgen gehouden in het leerkrachtenscherm. Alleen de maker ontvangt die code; de database bewaart de code in afgeschermde gegevens die leerlingen niet kunnen lezen. Herstel op een ander toestel werkt via de spelcode plus die geheime code. Beveiligingsregels controleren de code voordat eigendom wordt overgedragen. Het bestaande bord en de scores blijven bewaard en de wedstrijd wordt gepauzeerd. Bewaar de code privé, ook bij projectie van het leerkrachtenscherm.

Dit model vertrouwt de leerkracht. Het is geen toernooisysteem dat ook tegen een kwaadwillende leerkracht bescherming biedt.

## Projectscheiding

Alleen `Intunez/Mission-Galaxy-90-180-` wordt gewijzigd. De Machtentempel en diens database blijven onaangeroerd. De transportcode accepteert uitsluitend `mission-galaxy-3d247` en de bijbehorende Europese database-URL. De gegevens staan onder `galaxySpark/`.

## Eenmalig aansluiten in de eigen Firebase-console

1. Het eigen project `mission-galaxy-3d247` blijft op Spark.
2. Webapp, Realtime Database in `europe-west1`, anonieme aanmelding en het domein `intunez.github.io` zijn ingesteld.
3. Open **Realtime Database → Rules** van uitsluitend dit project. Vervang de regels door de volledige inhoud van `firebase-database.rules.json` en klik **Publish**. Deze regels mogen nooit naar een ander project worden gekopieerd.
4. Open het spel op het leerkrachtentoestel en kies **Teamwedstrijd starten → Online ruimtemissie maken**.
5. Laat teams op andere toestellen **Deelnemen met code** kiezen. Controleer het aantal deelnemers en start de missie.
6. Bewaar de geheime leerkrachtcode privé. Laat het leerkrachtentoestel open tijdens het spelen.

Zolang stap 3 niet is uitgevoerd, blijft de database gesloten en wordt online deelname geweigerd. Een webconfiguratie op zichzelf activeert de database niet. Wachtwoorden, Google-aanmeldcodes of service-account-sleutels zijn niet nodig in de repository of in een gesprek.

## Testen

```
npm test
npm run sync-engine
firebase emulators:exec --project demo-mission-galaxy-tests --only auth,database "node tests/spark-emulator.cjs"
```

De tests controleren 1.000 borden, alle 105 beurten met 21 teams, timing, voorvertoningen, scores, pauze, herstel, verborgen antwoorden en ontbrekende lege database-arrays. De integratietest gebruikt echte Firebase Authentication- en Realtime Database-emulators, controleert de Spark-transportcode en probeert leerlingrechten te misbruiken. Er zijn geen Cloud Functions nodig voor ontwikkeling, tests of productie.

`engine/engine.cjs` bevat de gedeelde spelregels. `scripts/sync-local-engine.cjs` maakt de browsermodule. `spark-transport.js` verzorgt de online synchronisatie. `firebase-database.rules.json` handhaaft de toegangsgrenzen.
