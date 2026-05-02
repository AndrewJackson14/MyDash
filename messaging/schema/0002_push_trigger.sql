-- Optional: fire a push notification on every new conversation message.
-- The trigger http_posts to a `send-push` edge function with the recipient
-- ids and sender id; the edge function looks up device tokens and pushes.
-- If you don't need push, skip this file entirely.
--
-- Two values you must replace before applying:
--   YOUR_PROJECT_REF — your Supabase project ref (the subdomain of supabase.co)
--   YOUR_SERVICE_ROLE_JWT — service role key for the project
--
-- Embedding the JWT in the trigger body is not pretty; the alternative is
-- a SECURITY DEFINER function that reads from a server-side secrets table.
-- Both work.

CREATE OR REPLACE FUNCTION public.notify_push_conversation_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  recipient_ids uuid[];
BEGIN
  -- Recipients = all participants except the sender
  SELECT array_agg(member_id) INTO recipient_ids
  FROM public.conversation_participants
  WHERE conversation_id = NEW.conversation_id
    AND member_id != NEW.sender_id;

  IF recipient_ids IS NOT NULL AND array_length(recipient_ids, 1) > 0 THEN
    PERFORM net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_JWT'
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'record', jsonb_build_object(
          'recipient_ids', to_jsonb(recipient_ids),
          'sender_id', NEW.sender_id
        )
      )
    );
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS on_new_conversation_message_push
  ON public.conversation_messages;
CREATE TRIGGER on_new_conversation_message_push
  AFTER INSERT ON public.conversation_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_push_conversation_message();
