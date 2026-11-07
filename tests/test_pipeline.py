import json
from datetime import datetime, timezone

from scraper.processing import build_dataframe, clean
from scraper.stores.falabella import FalabellaScraper, parse_price
from scraper.stores.vtex import card_price_from_offer


def test_parse_price_colombian_format():
    assert parse_price(["2.339.900"]) == 2339900.0
    assert parse_price([]) is None


def test_vtex_percentual_card_discount():
    offer = {"Price": 1000000, "ListPrice": 1500000, "Teasers": [{
        "<Conditions>k__BackingField": {"<Parameters>k__BackingField": [
            {"<Name>k__BackingField": "RestrictionsBins", "<Value>k__BackingField": "1,2"}]},
        "<Effects>k__BackingField": {"<Parameters>k__BackingField": [
            {"<Name>k__BackingField": "PercentualDiscount", "<Value>k__BackingField": "5.5"}]}}]}
    assert card_price_from_offer(offer) == 945000


def test_falabella_parse():
    r = {"skuId": "1", "displayName": "Nevera X", "brand": "LG", "url": "u", "mediaUrls": ["i"],
         "prices": [{"type": "cmrPrice", "price": ["900.000"]}, {"type": "normalPrice", "price": ["1.200.000"]}]}
    row = FalabellaScraper.__new__(FalabellaScraper).parse_product(r, "Neveras")
    assert row["card_price"] == 900000 and row["regular_price"] == 1200000


def test_clean_dedup_and_model():
    base = dict(store="exito", category="Neveras", sku="1", brand="lg", regular_price=3e6, price=2e6,
                card_price=1.9e6, card_type="exito", image_url="i", product_url="u")
    rows = [dict(base, name="Nevera LG GM-B392 No Frost"), dict(base, name="Nevera LG GM-B392 No Frost", price=2.1e6),
            dict(base, sku="2", name="Garantía Extendida nevera", price=3e5)]
    df = clean(build_dataframe(rows), datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert df.height == 1 and df["price"][0] == 2000000 and df["brand"][0] == "Lg"
