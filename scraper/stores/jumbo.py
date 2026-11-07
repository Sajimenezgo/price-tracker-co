from .vtex import VtexScraper
from .. import config


class JumboScraper(VtexScraper):
    store = "jumbo"
    base_url = "https://www.jumbocolombia.com"
    card_type = "jumbo"
    categories_map = config.JUMBO_CATEGORIES
