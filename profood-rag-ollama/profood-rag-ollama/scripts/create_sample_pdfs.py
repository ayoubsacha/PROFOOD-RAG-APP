from pathlib import Path

from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / "data" / "pdfs"
PDF_DIR.mkdir(parents=True, exist_ok=True)

styles = getSampleStyleSheet()
TITLE = styles["Title"]
HEADING = styles["Heading2"]
BODY = styles["BodyText"]


def build_pdf(filename: str, title: str, sections: list[tuple[str, str]]) -> None:
    path = PDF_DIR / filename
    doc = SimpleDocTemplate(str(path), pagesize=A4)
    story = [Paragraph(title, TITLE), Spacer(1, 18)]

    for heading, body in sections:
        story.append(Paragraph(heading, HEADING))
        for paragraph in body.split("\n"):
            paragraph = paragraph.strip()
            if paragraph:
                story.append(Paragraph(paragraph, BODY))
                story.append(Spacer(1, 8))
        story.append(Spacer(1, 8))

    doc.build(story)
    print(f"Created {path}")


build_pdf(
    "profood_products.pdf",
    "Profood Sample Product Catalog",
    [
        (
            "Argan Oil - Food Grade",
            "Type: Product. Category: Natural oils. Region: Souss-Massa, Morocco. "
            "Description: Cold-pressed argan oil used for cooking, traditional Moroccan recipes, "
            "and premium food preparation. Packaging options include 250 ml and 500 ml glass bottles. "
            "Recommended storage: cool and dark place.",
        ),
        (
            "Olive Oil - Extra Virgin",
            "Type: Product. Category: Olive products. Region: Tangier-Tetouan-Al Hoceima. "
            "Description: Extra virgin olive oil from small agricultural cooperatives. Suitable for restaurants, "
            "grocery shops, and food distributors. Available in 1 liter, 5 liter, and 20 liter containers.",
        ),
        (
            "Couscous Wheat Semolina",
            "Type: Product. Category: Grains and dry foods. Region: Casablanca-Settat. "
            "Description: Medium grain couscous semolina for retailers, catering companies, and local food shops. "
            "Can be sold in 1 kg consumer bags or 25 kg professional bags.",
        ),
    ],
)

build_pdf(
    "profood_equipment.pdf",
    "Profood Sample Equipment Catalog",
    [
        (
            "Olive Oil Press Machine",
            "Type: Equipment. Category: Food processing equipment. Use case: olive oil production. "
            "Description: Mechanical press used to extract oil from cleaned olives. Often used with washing, crushing, "
            "and filtration units. Useful for cooperatives, farms, and small production workshops.",
        ),
        (
            "Vacuum Packaging Machine",
            "Type: Equipment. Category: Packaging equipment. Use case: preservation and distribution. "
            "Description: Removes air from packaging to extend shelf life of food products such as cheese, dates, olives, "
            "meat, spices, and processed vegetables. Suitable for small and medium sellers.",
        ),
        (
            "Milk Pasteurization Tank",
            "Type: Equipment. Category: Dairy equipment. Use case: milk and cheese production. "
            "Description: Stainless steel tank used to heat milk to controlled temperatures for safer dairy production. "
            "Can support local dairy cooperatives and cheese producers.",
        ),
    ],
)

build_pdf(
    "profood_forum_faq.pdf",
    "Profood Sample Forum and FAQ Knowledge",
    [
        (
            "Forum Question: What equipment do I need to start olive oil production?",
            "Answer: A small olive oil production setup usually needs olive washing equipment, a crusher or mill, "
            "an oil press or decanter, filtration equipment, storage tanks, and bottles or packaging material. "
            "For a small cooperative, start with a press machine, basic filtration, and clean storage containers.",
        ),
        (
            "Forum Question: How can I package local food products better?",
            "Answer: Sellers should choose packaging based on shelf life, transport distance, and product type. "
            "Vacuum packaging is useful for cheese, olives, dates, and meat. Glass bottles are useful for olive oil and argan oil. "
            "Clear labels should include product name, origin, weight or volume, and storage advice.",
        ),
        (
            "Forum Question: What should I check before buying second-hand equipment?",
            "Answer: Check the equipment material, electricity requirements, production capacity, spare parts availability, "
            "maintenance history, hygiene condition, and whether it matches the product category you want to produce. "
            "Ask for a demonstration before purchase when possible.",
        ),
    ],
)
