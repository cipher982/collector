-- Convert TEXT columns to JSONB for the original 4 data columns
-- Uses a defensive approach to handle various edge cases:
-- 1. NULL values -> NULL
-- 2. Empty strings -> empty JSON object/array
-- 3. Valid JSON -> parse directly
-- 4. Invalid JSON -> empty JSON object/array (graceful fallback)
--
-- Note: The USING clause attempts to cast to JSONB, and on failure (invalid JSON),
-- we catch it in a separate step by checking for parse errors.

-- First, let's create a helper function to safely convert text to jsonb
CREATE OR REPLACE FUNCTION safe_text_to_jsonb(input_text TEXT, default_value JSONB)
RETURNS JSONB AS $$
BEGIN
    IF input_text IS NULL THEN
        RETURN NULL;
    ELSIF input_text = '' THEN
        RETURN default_value;
    ELSE
        -- Try to parse as JSON
        BEGIN
            RETURN input_text::JSONB;
        EXCEPTION WHEN OTHERS THEN
            -- If parsing fails, return default value
            RETURN default_value;
        END;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- browser_info: TEXT -> JSONB
ALTER TABLE debug_data
    ALTER COLUMN browser_info TYPE JSONB
    USING safe_text_to_jsonb(browser_info, '{}'::jsonb);

-- performance_data: TEXT -> JSONB
ALTER TABLE debug_data
    ALTER COLUMN performance_data TYPE JSONB
    USING safe_text_to_jsonb(performance_data, '{}'::jsonb);

-- fingerprints: TEXT -> JSONB
ALTER TABLE debug_data
    ALTER COLUMN fingerprints TYPE JSONB
    USING safe_text_to_jsonb(fingerprints, '{}'::jsonb);

-- errors: TEXT -> JSONB (stored as JSON array)
ALTER TABLE debug_data
    ALTER COLUMN errors TYPE JSONB
    USING safe_text_to_jsonb(errors, '[]'::jsonb);

-- Clean up the helper function
DROP FUNCTION IF EXISTS safe_text_to_jsonb(TEXT, JSONB);
