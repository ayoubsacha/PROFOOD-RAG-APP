from __future__ import annotations

import re
import unicodedata


OFFICIAL_SPECIALIST_NAMES = {
    "general": "Assistant Général ProFood",
    "food": "Spécialiste Produits Alimentaires",
    "equipment": "Spécialiste Équipements Professionnels",
    "supplier": "Spécialiste Fournisseurs",
    "services": "Spécialiste Services",
    "taxonomy": "Spécialiste Catégories et Taxonomies",
}


SPECIALIST_KEYWORDS = {
    "food": {
        "produit alimentaire": 4,
        "produits alimentaires": 4,
        "alimentaire": 2,
        "aliments": 2,
        "ingredient": 3,
        "ingredients": 3,
        "farine": 3,
        "huile": 3,
        "olive": 2,
        "lait": 3,
        "fromage": 3,
        "viande": 3,
        "poisson": 3,
        "epice": 3,
        "epices": 3,
        "fruit": 3,
        "fruits": 3,
        "legume": 3,
        "legumes": 3,
        "boisson": 3,
        "boissons": 3,
        "epicerie": 3,
        "produits frais": 4,
        "produits secs": 4,
        "surgeles": 3,
        "conservation": 2,
        "qualite alimentaire": 3,
        "food product": 4,
        "food products": 4,
    },
    "equipment": {
        "equipement": 5,
        "equipements": 5,
        "equipment": 5,
        "materiel": 5,
        "appareil": 4,
        "appareils": 4,
        "outil": 3,
        "outils": 3,
        "ustensile": 3,
        "ustensiles": 3,
        "machine": 5,
        "machines": 5,
        "four": 5,
        "fours": 5,
        "oven": 5,
        "petrin": 5,
        "petrins": 5,
        "refrigerateur": 5,
        "refrigerateurs": 5,
        "frigo": 3,
        "congelateur": 5,
        "congelateurs": 5,
        "vitrine refrigeree": 5,
        "machine a cafe": 5,
        "robot coupe": 5,
        "mixeur": 3,
        "conditionneuse": 5,
        "ensacheuse": 5,
        "peseuse": 3,
        "ligne de production": 5,
        "packaging equipment": 5,
    },
    "supplier": {
        "fournisseur": 7,
        "fournisseurs": 7,
        "supplier": 7,
        "suppliers": 7,
        "partenaire": 6,
        "partenaires": 6,
        "vendeur": 6,
        "vendeurs": 6,
        "revendeur": 6,
        "revendeurs": 6,
        "fabricant": 6,
        "fabricants": 6,
        "importateur": 6,
        "importateurs": 6,
        "grossiste": 3,
        "grossistes": 3,
        "distributeur": 3,
        "distributeurs": 3,
        "approvisionnement": 3,
        "devis": 3,
        "devis fournisseur": 7,
        "comparer les fournisseurs": 7,
        "choisir un fournisseur": 7,
        "fiable": 2,
        "fiables": 2,
    },
    "services": {
        "service": 3,
        "services": 3,
        "livraison": 7,
        "maintenance": 7,
        "installation": 7,
        "assistance": 4,
        "sav": 7,
        "reparation": 7,
        "nettoyage": 7,
        "contrat": 3,
        "contrats": 3,
        "sla": 4,
        "transport": 3,
        "logistique": 3,
        "formation": 3,
        "support": 3,
        "conseil": 3,
    },
    "taxonomy": {
        "categorie": 3,
        "categories": 3,
        "taxonomie": 4,
        "taxonomies": 4,
        "classification": 3,
        "famille": 3,
        "familles": 3,
        "sous categorie": 3,
        "sous categories": 3,
        "domaine": 2,
        "domaines": 2,
        "unite": 2,
        "unites": 2,
        "region": 2,
        "ville": 2,
        "secteur": 2,
    },
}


SPECIALISTS = {
    "general": {
        "name": "Assistant Général ProFood",
        "filters": {},
        "prompt": (
            "Tu es l'assistant général de la plateforme ProFood. Tu aides les utilisateurs à comprendre "
            "la plateforme, ses fonctionnalités, la navigation, les commandes, les fournisseurs, les produits "
            "et les services. Réponds de manière claire, professionnelle et utile."
        ),
    },
    "food": {
        "name": "Spécialiste Produits Alimentaires",
        "filters": {"specialist": "food"},
        "prompt": (
            "Tu es le spécialiste des produits alimentaires de la plateforme ProFood. Tu aides les professionnels "
            "à comprendre les produits alimentaires, les ingrédients, la conservation, la qualité, les usages "
            "professionnels et les catégories alimentaires. Si la question ne correspond pas à ton domaine, "
            "ne donne aucune réponse métier, même vague. Indique uniquement le spécialiste ProFood officiel à consulter."
        ),
    },
    "equipment": {
        "name": "Spécialiste Équipements Professionnels",
        "filters": {"specialist": "equipment"},
        "prompt": (
            "Tu es le spécialiste des équipements professionnels de la plateforme ProFood. Tu aides les restaurants, "
            "boulangeries, cafés et professionnels à choisir les équipements adaptés : fours, pétrins, réfrigérateurs, "
            "machines à café, matériel de cuisine et équipements professionnels. Si la question ne correspond pas à "
            "ton domaine, ne donne aucune réponse métier, même vague. Indique uniquement le spécialiste ProFood officiel à consulter."
        ),
    },
    "supplier": {
        "name": "Spécialiste Fournisseurs",
        "filters": {"specialist": "supplier"},
        "prompt": (
            "Tu es le spécialiste des fournisseurs de la plateforme ProFood. Tu aides les utilisateurs à identifier, "
            "comparer et choisir des fournisseurs selon la ville, la catégorie, le type de produit, le secteur "
            "d'activité, la qualité et les besoins professionnels. Si la question ne correspond pas à ton domaine, "
            "ne donne aucune réponse métier, même vague. Indique uniquement le spécialiste ProFood officiel à consulter."
        ),
    },
    "services": {
        "name": "Spécialiste Services",
        "filters": {"specialist": "services"},
        "prompt": (
            "Tu es le spécialiste des services professionnels de la plateforme ProFood. Tu aides les utilisateurs "
            "concernant les services de livraison, maintenance, installation, assistance, conseil et support "
            "professionnel. Si la question ne correspond pas à ton domaine, ne donne aucune réponse métier, "
            "même vague. Indique uniquement le spécialiste ProFood officiel à consulter."
        ),
    },
    "taxonomy": {
        "name": "Spécialiste Catégories et Taxonomies",
        "filters": {"specialist": "taxonomy"},
        "prompt": (
            "Tu es le spécialiste des domaines, catégories et taxonomies de la plateforme ProFood. Tu aides à "
            "expliquer les relations entre domaines, taxonomies, catégories, unités, régions, villes, types "
            "d'activité et secteurs professionnels. Si la question ne correspond pas à ton domaine, ne donne "
            "aucune réponse métier, même vague. Indique uniquement le spécialiste ProFood officiel à consulter."
        ),
    },
}


def _normalize_text(text: str) -> str:
    normalized = unicodedata.normalize("NFKD", text.lower())
    without_accents = "".join(
        character for character in normalized if not unicodedata.combining(character)
    )

    return re.sub(r"\s+", " ", without_accents).strip()


def _keyword_matches(text: str, keyword: str) -> bool:
    normalized_keyword = _normalize_text(keyword)

    if " " in normalized_keyword:
        return normalized_keyword in text

    return re.search(rf"\b{re.escape(normalized_keyword)}\b", text) is not None


def get_specialist_scores(question: str) -> dict[str, int]:
    normalized_question = _normalize_text(question)
    scores: dict[str, int] = {}

    for specialist_id, keywords in SPECIALIST_KEYWORDS.items():
        score = sum(
            weight
            for keyword, weight in keywords.items()
            if _keyword_matches(normalized_question, keyword)
        )

        if score:
            scores[specialist_id] = score

    return scores


def infer_specialist_from_question(question: str) -> str | None:
    scores = get_specialist_scores(question)

    if not scores:
        return None

    ranked_scores = sorted(scores.items(), key=lambda item: item[1], reverse=True)
    top_specialist, top_score = ranked_scores[0]
    second_score = ranked_scores[1][1] if len(ranked_scores) > 1 else 0

    if top_score < 3 or top_score == second_score:
        return None

    return top_specialist


def get_out_of_scope_response(selected_specialist: str, question: str) -> str | None:
    normalized_specialist = normalize_specialist_id(selected_specialist)

    if normalized_specialist == "general":
        return None

    scores = get_specialist_scores(question)
    selected_score = scores.get(normalized_specialist, 0)
    inferred_specialist = infer_specialist_from_question(question)

    if inferred_specialist and inferred_specialist != normalized_specialist:
        official_name = OFFICIAL_SPECIALIST_NAMES[inferred_specialist]

        return f"Veuillez consulter le {official_name}."

    if selected_score > 0:
        return None

    if scores:
        return "Veuillez consulter le spécialiste ProFood adapté à ce domaine."

    selected_name = OFFICIAL_SPECIALIST_NAMES[normalized_specialist]

    return (
        f"Cette question ne correspond pas au domaine du {selected_name}. "
        "Veuillez consulter le spécialiste ProFood adapté."
    )


def normalize_specialist_id(specialist_id: str | None) -> str:
    clean_specialist_id = (specialist_id or "general").strip().lower()

    if clean_specialist_id in SPECIALISTS:
        return clean_specialist_id

    return "general"


def get_specialist_config(specialist_id: str):
    return SPECIALISTS[normalize_specialist_id(specialist_id)]
