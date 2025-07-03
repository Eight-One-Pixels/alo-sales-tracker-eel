-- Update visit_type enum to include the correct values
-- This migration fixes the mismatch between the enum values and what the application expects

-- First, check if the enum exists with old values and update it
DO $$ 
BEGIN
    -- Check if the enum needs to be updated
    IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'visit_type') THEN
        -- Add new enum values if they don't exist
        BEGIN
            ALTER TYPE public.visit_type ADD VALUE IF NOT EXISTS 'cold_call';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        
        BEGIN
            ALTER TYPE public.visit_type ADD VALUE IF NOT EXISTS 'presentation';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        
        BEGIN
            ALTER TYPE public.visit_type ADD VALUE IF NOT EXISTS 'meeting';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        
        BEGIN
            ALTER TYPE public.visit_type ADD VALUE IF NOT EXISTS 'phone_call';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
        
        BEGIN
            ALTER TYPE public.visit_type ADD VALUE IF NOT EXISTS 'follow_up';
        EXCEPTION WHEN duplicate_object THEN NULL;
        END;
    ELSE
        -- Create the enum if it doesn't exist
        CREATE TYPE public.visit_type AS ENUM (
            'cold_call',
            'follow_up', 
            'presentation',
            'meeting',
            'phone_call'
        );
    END IF;
END $$;

-- Update any existing records that might have old enum values
-- This is a safeguard in case there are existing visits with old enum values
UPDATE public.daily_visits 
SET visit_type = CASE 
    WHEN visit_type::text = 'initial' THEN 'cold_call'::visit_type
    WHEN visit_type::text = 'follow-up' THEN 'follow_up'::visit_type  
    WHEN visit_type::text = 'final' THEN 'presentation'::visit_type
    ELSE visit_type
END
WHERE visit_type::text IN ('initial', 'follow-up', 'final');
