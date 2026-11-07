from .vtex import VtexScraper
from .. import config


class ExitoScraper(VtexScraper):
    store = "exito"
    base_url = "https://www.exito.com"
    card_type = "exito"
    categories_map = config.EXITO_CATEGORIES
