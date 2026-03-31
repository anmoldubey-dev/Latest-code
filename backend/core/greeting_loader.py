# ================================================================
# FILE EXECUTION FLOW
# ================================================================
#
# [ START ]
#     |
#     v
# +--------------------------------+
# | load_greetings()               |
# | * load greetings 3-level fall  |
# +--------------------------------+
#     |
#     |----> <Path> -> exists()
#     |        * check for greetings.xlsx
#     |
#     |----> read_excel()
#     |        * parse xlsx sheet by lang key
#     |      OR
#     |----> <Path> -> glob()
#     |        * find all *.txt greeting files
#     |
#     |----> <Path> -> read_text()
#     |        * read each language text file
#     |
#     v
# [ RETURN dict ]
#
# ================================================================

import logging
from pathlib import Path
from typing import Dict

logger = logging.getLogger("callcenter.greetings")

_BACKEND_ROOT = Path(__file__).parent.parent
GREETINGS_DIR = _BACKEND_ROOT / "greetings"
EXCEL_PATH    = GREETINGS_DIR / "greetings.xlsx"
EXCEL_SHEET   = "greetings"


def load_greetings() -> Dict[str, str]:
    if EXCEL_PATH.exists():
        try:
            import pandas as pd

            df = pd.read_excel(EXCEL_PATH, sheet_name=EXCEL_SHEET, dtype=str)

            df.columns = [str(c).strip().lower() for c in df.columns]

            if "lang" not in df.columns or "greeting" not in df.columns:
                logger.warning(
                    "greetings.xlsx is missing required columns "
                    "'lang' and/or 'greeting' — falling back to TXT files."
                )
            else:
                result: Dict[str, str] = {}
                for _, row in df.iterrows():
                    lang_val     = row.get("lang")
                    greeting_val = row.get("greeting")
                    if pd.notna(lang_val) and pd.notna(greeting_val):
                        key = str(lang_val).strip()
                        val = str(greeting_val).strip()
                        if key and val:
                            result[key] = val

                if result:
                    logger.info(
                        "Greetings loaded from Excel | %d language(s): %s",
                        len(result), list(result.keys()),
                    )
                    return result

                logger.warning(
                    "greetings.xlsx contains no valid rows — falling back to TXT files."
                )

        except ImportError:
            logger.warning(
                "pandas / openpyxl not installed — cannot read greetings.xlsx. "
                "Falling back to TXT files. "
                "To enable Excel support: pip install pandas openpyxl"
            )
        except Exception as exc:
            logger.warning(
                "Failed to read greetings.xlsx (%s) — falling back to TXT files.", exc
            )

    if GREETINGS_DIR.exists():
        result = {}
        for txt_path in sorted(GREETINGS_DIR.glob("*.txt")):
            lang_code = txt_path.stem
            try:
                text = txt_path.read_text(encoding="utf-8").strip()
                if text:
                    result[lang_code] = text
            except Exception as exc:
                logger.warning("Could not read greeting file %s: %s", txt_path.name, exc)

        if result:
            logger.info(
                "Greetings loaded from TXT | %d language(s): %s",
                len(result), list(result.keys()),
            )
            return result

    logger.warning(
        "Using default hardcoded greetings "
        "(no greetings.xlsx or *.txt files found in %s).",
        GREETINGS_DIR,
    )
    return {}
