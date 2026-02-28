#!/usr/bin/env python3
"""
🔮 Zodiac Knowledge Base
Provides astrology information without bloating LLM context
"""

ZODIAC_DATA = {
    "aries": {
        "dates": "March 21 - April 19",
        "element": "Fire",
        "ruling_planet": "Mars",
        "symbol": "Ram",
        "traits": "bold, energetic, confident, passionate",
    },
    "taurus": {
        "dates": "April 20 - May 20",
        "element": "Earth",
        "ruling_planet": "Venus",
        "symbol": "Bull",
        "traits": "reliable, patient, practical, devoted",
    },
    "gemini": {
        "dates": "May 21 - June 20",
        "element": "Air",
        "ruling_planet": "Mercury",
        "symbol": "Twins",
        "traits": "curious, adaptable, outgoing, intelligent",
    },
    "cancer": {
        "dates": "June 21 - July 22",
        "element": "Water",
        "ruling_planet": "Moon",
        "symbol": "Crab",
        "traits": "emotional, nurturing, intuitive, protective",
    },
    "leo": {
        "dates": "July 23 - August 22",
        "element": "Fire",
        "ruling_planet": "Sun",
        "symbol": "Lion",
        "traits": "confident, dramatic, generous, warm-hearted",
    },
    "virgo": {
        "dates": "August 23 - September 22",
        "element": "Earth",
        "ruling_planet": "Mercury",
        "symbol": "Maiden",
        "traits": "analytical, practical, kind, hardworking",
    },
    "libra": {
        "dates": "September 23 - October 22",
        "element": "Air",
        "ruling_planet": "Venus",
        "symbol": "Scales",
        "traits": "diplomatic, fair, social, gracious",
    },
    "scorpio": {
        "dates": "October 23 - November 21",
        "element": "Water",
        "ruling_planet": "Pluto",
        "symbol": "Scorpion",
        "traits": "intense, passionate, resourceful, brave",
    },
    "sagittarius": {
        "dates": "November 22 - December 21",
        "element": "Fire",
        "ruling_planet": "Jupiter",
        "symbol": "Archer",
        "traits": "adventurous, optimistic, freedom-loving, philosophical",
    },
    "capricorn": {
        "dates": "December 22 - January 19",
        "element": "Earth",
        "ruling_planet": "Saturn",
        "symbol": "Goat",
        "traits": "ambitious, disciplined, responsible, practical",
    },
    "aquarius": {
        "dates": "January 20 - February 18",
        "element": "Air",
        "ruling_planet": "Uranus",
        "symbol": "Water Bearer",
        "traits": "innovative, independent, humanitarian, intellectual",
    },
    "pisces": {
        "dates": "February 19 - March 20",
        "element": "Water",
        "ruling_planet": "Neptune",
        "symbol": "Fish",
        "traits": "intuitive, compassionate, artistic, gentle",
    },
}

# Month to sign mapping for birth date queries
MONTH_TO_SIGNS = {
    1: ["capricorn", "aquarius"],  # Jan
    2: ["aquarius", "pisces"],      # Feb
    3: ["pisces", "aries"],         # Mar
    4: ["aries", "taurus"],         # Apr
    5: ["taurus", "gemini"],        # May
    6: ["gemini", "cancer"],        # Jun
    7: ["cancer", "leo"],           # Jul
    8: ["leo", "virgo"],            # Aug
    9: ["virgo", "libra"],          # Sep
    10: ["libra", "scorpio"],       # Oct
    11: ["scorpio", "sagittarius"], # Nov
    12: ["sagittarius", "capricorn"],# Dec
}

def get_zodiac_by_date(month: int, day: int) -> str:
    """Get zodiac sign from birth date."""
    # Define cutoff days for each month
    cutoffs = {
        1: 20, 2: 19, 3: 21, 4: 20, 5: 21, 6: 21,
        7: 23, 8: 23, 9: 23, 10: 23, 11: 22, 12: 22
    }
    
    if month in cutoffs:
        signs = MONTH_TO_SIGNS[month]
        return signs[0] if day < cutoffs[month] else signs[1]
    return "unknown"

def get_signs_by_element(element: str) -> list:
    """Get all signs for a given element."""
    element_lower = element.lower()
    return [sign for sign, data in ZODIAC_DATA.items() if data["element"].lower() == element_lower]

def handle_zodiac_query(query: str) -> str:
    """
    Handle zodiac-related queries with keyword matching.
    Returns response string or empty string if not a zodiac query.
    """
    query_lower = query.lower()
    
    # Check for specific sign queries
    for sign, data in ZODIAC_DATA.items():
        if sign in query_lower:
            # What is X?
            if any(phrase in query_lower for phrase in ["what is", "tell me about", "define"]):
                return (f"{sign.capitalize()} ({data['dates']}) is a {data['element']} sign. "
                       f"It's ruled by {data['ruling_planet']}, symbolized by the {data['symbol']}, "
                       f"and associated with traits like {data['traits']}.")
            
            # Traits of X
            if any(word in query_lower for word in ["trait", "characteristic", "personality"]):
                return f"{sign.capitalize()} is known for being {data['traits']}."
            
            # Element of X
            if "element" in query_lower:
                return f"{sign.capitalize()} is a {data['element']} sign."
            
            # When is X / dates
            if any(word in query_lower for word in ["when", "date", "season"]):
                return f"{sign.capitalize()} season is {data['dates']}."
            
            # Ruling planet
            if any(word in query_lower for word in ["planet", "rule"]):
                return f"{sign.capitalize()} is ruled by {data['ruling_planet']}."
            
            # Symbol
            if "symbol" in query_lower:
                return f"The symbol for {sign.capitalize()} is the {data['symbol']}."
    
    # List all signs
    if any(phrase in query_lower for phrase in ["list all", "all zodiac", "all signs", "12 signs"]):
        signs_list = ", ".join([s.capitalize() for s in ZODIAC_DATA.keys()])
        return f"The 12 zodiac signs are: {signs_list}."
    
    # Birth date queries
    import re
    
    # "born in Month" or "born in Month day"
    month_match = re.search(r'born (?:in|on) (\w+)', query_lower)
    if month_match:
        month_names = {
            "january": 1, "february": 2, "march": 3, "april": 4,
            "may": 5, "june": 6, "july": 7, "august": 8,
            "september": 9, "october": 10, "november": 11, "december": 12
        }
        
        month_str = month_match.group(1)
        for name, num in month_names.items():
            if month_str in name:
                signs = MONTH_TO_SIGNS[num]
                if len(signs) == 2:
                    sign1_data = ZODIAC_DATA[signs[0]]
                    sign2_data = ZODIAC_DATA[signs[1]]
                    return (f"Someone born in {name.capitalize()} could be "
                           f"{signs[0].capitalize()} ({sign1_data['dates']}) or "
                           f"{signs[1].capitalize()} ({sign2_data['dates']}).")
                break
    
    # Specific date like "March 25" or "March 25th"
    date_match = re.search(r'(\w+)\s+(\d+)(?:st|nd|rd|th)?', query_lower)
    if date_match and ("born" in query_lower or "birthday" in query_lower or "what am i" in query_lower):
        month_names = {
            "january": 1, "february": 2, "march": 3, "april": 4,
            "may": 5, "june": 6, "july": 7, "august": 8,
            "september": 9, "october": 10, "november": 11, "december": 12,
            "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
            "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
        }
        
        month_str = date_match.group(1)
        day_str = date_match.group(2)
        
        for name, num in month_names.items():
            if month_str in name:
                day = int(day_str)
                sign = get_zodiac_by_date(num, day)
                if sign != "unknown":
                    data = ZODIAC_DATA[sign]
                    return f"You're a {sign.capitalize()}! ({data['dates']})"
                break
    
    # Element queries
    if any(phrase in query_lower for phrase in ["fire sign", "water sign", "earth sign", "air sign"]):
        for element in ["fire", "water", "earth", "air"]:
            if element in query_lower:
                signs = get_signs_by_element(element)
                signs_str = ", ".join([s.capitalize() for s in signs])
                return f"The {element.capitalize()} signs are: {signs_str}."
    
    # Sequential order
    if "after" in query_lower or "before" in query_lower:
        signs_order = list(ZODIAC_DATA.keys())
        for i, sign in enumerate(signs_order):
            if sign in query_lower:
                if "after" in query_lower and i < len(signs_order) - 1:
                    next_sign = signs_order[i + 1]
                    return f"{next_sign.capitalize()} comes after {sign.capitalize()}."
                elif "before" in query_lower and i > 0:
                    prev_sign = signs_order[i - 1]
                    return f"{prev_sign.capitalize()} comes before {sign.capitalize()}."
    
    # Compatibility (simple version)
    if "compatible" in query_lower or "compatibility" in query_lower:
        # Extract two signs if present
        mentioned_signs = [sign for sign in ZODIAC_DATA.keys() if sign in query_lower]
        if len(mentioned_signs) >= 2:
            sign1, sign2 = mentioned_signs[0], mentioned_signs[1]
            elem1 = ZODIAC_DATA[sign1]["element"]
            elem2 = ZODIAC_DATA[sign2]["element"]
            
            if elem1 == elem2:
                return f"{sign1.capitalize()} and {sign2.capitalize()} are both {elem1} signs, which often indicates good compatibility."
            elif (elem1 in ["Fire", "Air"] and elem2 in ["Fire", "Air"]) or \
                 (elem1 in ["Water", "Earth"] and elem2 in ["Water", "Earth"]):
                return f"{sign1.capitalize()} ({elem1}) and {sign2.capitalize()} ({elem2}) can be compatible as their elements complement each other."
            else:
                return f"{sign1.capitalize()} ({elem1}) and {sign2.capitalize()} ({elem2}) have different elemental energies, which can create both challenges and growth."
    
    return ""  # Not a zodiac query
