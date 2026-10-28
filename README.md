# Mission Galaxy 90°/180°

Educatieve memory met 24 kaarten, complementaire en supplementaire hoeken, afzonderlijke geanimeerde ruimte-elementen en de aangeleverde muziekvideo.

Website: https://intunez.github.io/Mission-Galaxy-90-180-/

## Beschikbaar

- Vrij oefenen en tijdchallenge: 15 seconden voorvertoning, beide gekozen kaarten 4,4 seconden zichtbaar (inclusief 0,35 s draaien), +5 bij een juist paar, lokale persoonlijke records. Verplichte wachttijd en animaties tellen niet mee in de tijdchallenge.
- Teamwedstrijd op één toestel: 1–21 teams, willekeurige volgorde, precies vijf beurten per team, 15 s selectietijd, +5/−1 met ondergrens nul, nieuwe borden met voorvertoning wanneer nodig, race, leerkrachtenbeheer, pauze, finale, gelijke rang en opnieuw spelen.
- MP4 van 118,83 s met geluid: als enige media-element doorlopend herhaald, naast de memorykaarten, te vergroten, volume en dempen onthouden. De originele MP3 is bewaard maar wordt niet tegelijk afgespeeld.
- Online client en servercode zijn aanwezig. **Online teams blijven uitgeschakeld zolang het aparte Firebase-project niet is ingesteld en de server en regels niet zijn gedeployd.** `firebase-config.js` is daarom nu `null`.

## De Machtentempel blijft gescheiden

Deze repository is uitsluitend `Intunez/Mission-Galaxy-90-180-`. Er worden geen bestanden, instellingen of gegevens van De Machtentempel aangepast. De webclient bevat geen configuratie of verbinding naar de oude database. De server en alle deployhooks weigeren ieder project waarvan de ID niet met `mission-galaxy-` begint. De regels horen uitsluitend bij het nieuwe project; ze mogen nooit op een bestaand ander project worden gepubliceerd.

## Online architectuur

- Firebase Authentication: anonieme, op het toestel bewaarde identiteit.
- Callable `galaxyAction` in `europe-west1`: de server bepaalt score, beurtvolgorde, deadlines, juiste paren, nieuwe borden en wie mag beheren.
- Realtime Database `galaxy/privateRooms`: volledige serverstaat, niet leesbaar of schrijfbaar voor clients. `galaxy/rooms`: beperkte projectie, alleen leesbaar voor de leerkracht en deelnemers van die kamer. Alle rechtstreekse clientwrites zijn verboden, ook voor de host.
- Kaart-ID's zijn willekeurig. Verborgen kaarten bevatten geen tekst of paar-ID. Leerkrachtcodes worden alleen als SHA-256-hash in de private staat bewaard. De ruwe code gaat uitsluitend naar de maker en diens lokale opslag.
- Herstel op een ander toestel via spelcode plus geheime leerkrachtcode; de server draagt beheer over en pauzeert de missie. Teams behouden hun punten via de bewaarde Firebase-identiteit.
- Een hostlease van 12 s blokkeert selectie bij verbroken leerkrachtverbinding. Een terugkerende heartbeat hervat nooit stilzwijgend; de leerkracht moet hervatten. Clients synchroniseren via de serverklok.
- Elke actie heeft een verzoek-ID en elke selectie een bord-/beurtversie. Herhaalde of vertraagde verzoeken kunnen geen extra beurt of punten opleveren. Kamers verlopen na 24 uur.
- Teamnamen worden als tekst weergegeven, nooit als HTML.

## Aansluiten zonder ChatGPT-plug-in

De Firebase-plug-in is niet noodzakelijk. De officiële Firebase CLI kan worden gebruikt. Er is wel een Google-account met projectrechten nodig. Cloud Functions vereist een Blaze-project met gekoppelde facturering; dit wordt niet automatisch of zonder toestemming geactiveerd.

1. Meld aan met `firebase login`.
2. Maak **een nieuw** Firebase-project met ID `mission-galaxy-<uniek-suffix>`. Gebruik nooit het project van De Machtentempel. Kies voor Realtime Database een Europese locatie en schakel anonieme authenticatie in. Registreer een webapp en voeg `intunez.github.io` toe aan de toegestane domeinen.
3. Vul uitsluitend de publieke webappconfiguratie in `firebase-config.js` in als `export default { apiKey, authDomain, databaseURL, projectId, appId };`. Geen service-account-sleutels of wachtwoorden in de repository.
4. Installeer Node 22 en de dependencies: `npm --prefix functions ci`.
5. Test: `npm --prefix functions test` en de emulatortests hieronder.
6. Deploy expliciet naar het nieuwe project: `firebase deploy --project mission-galaxy-<uniek-suffix> --only functions:mission-galaxy,database`. De deployhooks blokkeren andere project-ID's, ook bij een afzonderlijke database-deploy.
7. Publiceer daarna de webconfiguratie in deze repository. Verifieer aanmaken, twee afzonderlijke teams op twee toestellen, serverdeadlines, verbindingsverlies en herstel. Controleer apart dat pogingen om scores direct te schrijven worden geweigerd.

De setup is pas online klaar wanneer deze publicatie en de controles werkelijk zijn uitgevoerd. Tot dan werkt de lokale teamwedstrijd zonder een Firebase-account.

## Testen

```
npm --prefix functions test
node scripts/sync-local-engine.cjs
firebase emulators:exec --project demo-mission-galaxy-tests --only auth,database "node tests/database-rules.cjs"
firebase emulators:exec --project demo-mission-galaxy-tests --only auth,database,functions "node tests/firebase-emulator.cjs"
```

De engine-tests behandelen 1.000 borden, 21 teams, 105 beurten over meerdere borden, wachttijden, timeout, scores, onbevoegde acties, pauze, verwijdering, geheime code en ontbrekende lege RTDB-arrays. De regeltest controleert echte Auth/Realtime Database-emulators. De volledige callable-integratietest vereist een omgeving die de lokale emulatorsockets ondersteunt; deze is beschikbaar maar moet daar worden uitgevoerd. Dit is geen bewijs dat productie-Firebase al is gedeployd.

## Bestanden

`index.html`, `team-game.js`, `team-game.css`, `local-engine.js`, `firebase-config.js` en `assets/mission-song.mp4` worden rechtstreeks vanaf GitHub Pages geladen. `functions/`, `tests/` en `firebase.json` zijn backend- en ontwikkelbestanden. Geen geheimen of runtimegegevens committen. De lokale engine wordt uit de server-engine gegenereerd en wordt uitsluitend gebruikt voor de expliciet lokale modus.
