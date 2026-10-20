# Contrat API utilisé par le frontend

Le contrat de référence est `docs/API.md` du dépôt backend. Ce résumé liste ce que le frontend appelle réellement (`src/lib/api.ts`). L'adresse de base vient de `VITE_API_BASE_URL` (par défaut `http://localhost:8080`).

## Format des erreurs

Le backend répond en `application/problem+json` : `{ "status": 400, "detail": "…", "errors": { "champ": "message" } }`. `ApiError` expose `status`, `message` (= `detail`) et `fieldErrors` (= `errors`), affichés à côté des champs. Une erreur réseau donne `status = 0`.

## Routes appelées

| Fonction | Requête | Jeton |
|---|---|---|
| `getPublicAddress(code)` | `GET /api/v1/addresses/{code}` | non |
| `register({email, password, displayName})` | `POST /api/v1/auth/register` → `AuthResponse` | non |
| `login({email, password})` | `POST /api/v1/auth/login` → `AuthResponse` | non |
| `getCurrentUser(token)` | `GET /api/v1/auth/me` → `User` | oui |
| `createMyAddress(token, input)` | `POST /api/v1/me/addresses` → `OwnerAddress` | oui |
| `listMyAddresses(token, page, size)` | `GET /api/v1/me/addresses?page=&size=` → `Page<OwnerAddress>` | oui |
| `getMyAddress(token, id)` | `GET /api/v1/me/addresses/{id}` → `OwnerAddress` | oui |
| `listAdminAddresses(token, status, page, size)` | `GET /api/v1/admin/addresses?status=` → `Page<OwnerAddress>` | oui (ADMIN) |
| `moderateAddress(token, id, 'validate' \| 'reject')` | `POST /api/v1/admin/addresses/{id}/validate` ou `/reject` | oui (ADMIN) |

| `uploadMyAddressPhoto(token, id, blob)` | `PUT /api/v1/me/addresses/{id}/photo` (multipart) | oui |
| `deleteMyAddressPhoto(token, id)` | `DELETE /api/v1/me/addresses/{id}/photo` | oui |
| `fetchProtectedPhoto(token, path)` | `GET …/me/addresses/{id}/photo` ou `…/admin/addresses/{id}/photo` → affichée via une URL `blob:` | oui |

La photo publique est affichée directement depuis `photoUrl` (chemin relatif à l'API).

Les écrans qui ont besoin de toutes les adresses (tableau de bord, carte, administration) parcourent les pages de 50 éléments, avec un maximum de 10 pages ; au-delà, un avertissement indique que les chiffres de la carte et des graphiques sont partiels (les compteurs de l’administration restent exacts, car ils viennent de `totalElements`).

Le jeton est envoyé dans `Authorization: Bearer …`, jamais dans l'URL.

## Création d'adresse

Corps envoyé :

```json
{ "title": "…", "placeType": "HOUSE", "district": "…", "city": "…", "description": null,
  "latitude": 14.5, "longitude": -15.5, "publicationConsent": true }
```

Le frontend n'envoie jamais `publicCode`, `status` ni propriétaire : le serveur les attribue. `publicationConsent` provient d'un choix explicite (aucune option cochée par défaut). Les coordonnées acceptent la virgule ou le point comme séparateur décimal à la saisie.

## Statuts affichés

| Valeur API | Libellé |
|---|---|
| `PENDING_VALIDATION` | En attente de validation |
| `VALIDATED` | Validée |
| `REJECTED` | Rejetée |
| `ARCHIVED` | Archivée |

Une adresse n'est consultable publiquement que si `publiclyAccessible` vaut `true` (validée **et** publication consentie).
