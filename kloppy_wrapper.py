import json
import numpy as np
from google import genai


def analyze_match(match_id="J03WMX", period_id=1, api_key=None, limit=5000):
    """
    Analyze football match formations and provide recommendations
    
    Args:
        match_id (str): ID of the match to analyze
        period_id (int): Period ID (1 or 2 for each half)
        api_key (str): Gemini API key for analysis
        limit (int): Maximum number of tracking data points to use
        
    Returns:
        dict: Analysis results with formations, metrics, and recommendations
    """
    print(f"Analyzing match: {match_id}, period: {period_id}, limit: {limit}")
    
    # Mock formations for testing purposes
    formations = {
        "home": "4-3-3",
        "away": "4-2-3-1"
    }
    
    # Mock metrics for testing purposes
    metrics = {
        "home": {
            "territory": 55.3,
            "pressing": 68.7
        },
        "away": {
            "territory": 44.7,
            "pressing": 52.8
        }
    }
    
    # Build the prompt for Gemini
    prompt = f"""Match {match_id} Analysis:

HOME TEAM:
- Formation: {formations['home']}
- Territory control: {metrics['home']['territory']:.1f}%
- Pressing intensity: {metrics['home']['pressing']:.1f}/100

AWAY TEAM:
- Formation: {formations['away']}
- Territory control: {metrics['away']['territory']:.1f}%
- Pressing intensity: {metrics['away']['pressing']:.1f}/100

Based on this analysis, please provide:
1. Evaluation of the effectiveness of each team's formation
2. Recommended formation adjustments for both teams
3. Specific tactical advantages these adjustments would provide
4. Key player positioning recommendations

Please format your response as a tactical analysis that could be presented to coaching staff.
"""
    
    # If no API key, return mock recommendations
    if not api_key:
        recommendations = {
            "prompt": prompt,
            "recommendations": """
# Tactical Analysis Report

## Current Formation Effectiveness

### Home Team (4-3-3)
The 4-3-3 formation has provided good territorial control (55.3%) and strong pressing capabilities (68.7/100). The three-man midfield is creating numerical advantages in central areas, while the front three are effectively pressing the opposition backline.

### Away Team (4-2-3-1)
The 4-2-3-1 is providing defensive stability but limiting territorial control (44.7%). The double pivot is protecting the backline reasonably well, but the team is struggling to transition effectively from defense to attack.

## Recommended Adjustments

### Home Team
Consider shifting to a 4-2-3-1 to better capitalize on the strong pressing numbers. This would add an additional attacking midfielder to exploit spaces created by the effective pressing.

### Away Team
A transition to a 4-3-3 with a single defensive midfielder would improve possession retention and territorial presence while maintaining defensive structure.

## Tactical Advantages

### Home Team
- Additional #10 would exploit spaces between opposition midfield and defense
- Wider attacking options with inverted wingers cutting inside
- Better defensive coverage from double pivot during counter-attacks

### Away Team
- Improved ball retention with additional central midfielder
- Better width in attack through positioning of wide forwards
- More balanced pressing structure across the pitch

## Key Player Positioning

### Home Team
- Central defensive midfielder should focus on screening passing lanes to opposition's #10
- Full-backs should maintain higher average position to support attacking width
- Central striker should focus on movement between center-backs rather than dropping deep

### Away Team
- Wingers should tuck inside when out of possession to create a 4-5-1 defensive shape
- Defensive midfielder should position between center-backs when full-backs advance
- #10 should drop deeper to create numerical advantage in midfield during build-up phase
            """
        }
    else:
        try:
            # Initialize Gemini client
            client = genai.Client(api_key=api_key)
            # Generate recommendations
            response = client.models.generate_content(
                model="gemini-1.5-pro",
                contents=[prompt]
            )
            recommendations = {
                "prompt": prompt,
                "recommendations": response.text
            }
        except Exception as e:
            print(f"Error generating recommendations with Gemini: {str(e)}")
            recommendations = {
                "prompt": prompt,
                "recommendations": f"Error: {str(e)}"
            }
    
    return {
        "match_id": match_id,
        "period_id": period_id,
        "formations": formations,
        "metrics": metrics,
        "recommendations": recommendations
    }

# For testing
if __name__ == "__main__":
    results = analyze_match(match_id="J03WMX", period_id=1, api_key=None, limit=5000)
    print(json.dumps(results, indent=2))
