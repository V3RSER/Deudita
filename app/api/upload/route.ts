import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { generateUUID } from '@/lib/types';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import fs from 'fs/promises';
import path from 'path';

function generateNumericId(): string {
  // Generates a 9 or 10-digit random number string like 119645919 or 4620142490
  return Math.floor(100000000 + Math.random() * 9000000000).toString();
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const uploadType = (formData.get('type') as string) || 'user_avatar'; // 'user_avatar' | 'expense_receipt'
    const customEntityId = formData.get('entityId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No se ha adjuntado ningún archivo' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Determine extension
    const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || 'jpg' : 'jpg';
    const uuid = generateUUID();

    const numericFolder = customEntityId && /^\d+$/.test(customEntityId)
      ? customEntityId
      : generateNumericId();

    let storagePath = '';
    let publicUrl = '';

    if (uploadType === 'user_avatar') {
      // Structure: uploads/user/avatar/{numericFolder}/large_{uuid}.{ext}
      storagePath = `uploads/user/avatar/${numericFolder}/large_${uuid}.${ext}`;
    } else {
      // Structure: uploads/expense/receipt/{numericFolder}/{uuid}.{ext}
      storagePath = `uploads/expense/receipt/${numericFolder}/${uuid}.${ext}`;
    }

    // 1. Try S3 SDK directly if S3 environment variables are provided
    const s3Endpoint = process.env.S3_ENDPOINT;
    const s3Region = process.env.S3_REGION || 'us-east-1';
    const s3AccessKeyId = process.env.S3_ACCESS_KEY_ID;
    const s3SecretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    const s3BucketName = process.env.S3_BUCKET_NAME || 'uploads';

    if (s3AccessKeyId && s3SecretAccessKey) {
      try {
        const s3Client = new S3Client({
          region: s3Region,
          endpoint: s3Endpoint || undefined,
          credentials: {
            accessKeyId: s3AccessKeyId,
            secretAccessKey: s3SecretAccessKey,
          },
          forcePathStyle: true,
        });

        await s3Client.send(
          new PutObjectCommand({
            Bucket: s3BucketName,
            Key: storagePath,
            Body: buffer,
            ContentType: file.type || 'image/jpeg',
          })
        );

        if (s3Endpoint) {
          publicUrl = `${s3Endpoint.replace(/\/$/, '')}/${s3BucketName}/${storagePath}`;
        } else {
          publicUrl = `https://${s3BucketName}.s3.${s3Region}.amazonaws.com/${storagePath}`;
        }
      } catch (s3Err) {
        console.warn('[API /api/upload] S3 SDK upload attempt failed:', s3Err);
      }
    }

    // 2. Try Supabase Storage JS API if publicUrl is not set yet
    if (!publicUrl) {
      try {
        const { data, error: uploadErr } = await supabase.storage
          .from('uploads')
          .upload(storagePath, buffer, {
            contentType: file.type || 'image/jpeg',
            upsert: true,
          });

        if (!uploadErr && data) {
          const { data: publicUrlData } = supabase.storage
            .from('uploads')
            .getPublicUrl(storagePath);

          if (publicUrlData?.publicUrl) {
            publicUrl = publicUrlData.publicUrl;
          }
        }
      } catch (storageErr) {
        console.warn('[API /api/upload] Supabase storage upload attempt failed:', storageErr);
      }
    }

    // 3. Local filesystem fallback for preview mode when no cloud storage credentials exist
    if (!publicUrl) {
      const localRelativePath = `/${storagePath}`;
      const localAbsolutePath = path.join(process.cwd(), 'public', storagePath);
      const dir = path.dirname(localAbsolutePath);

      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(localAbsolutePath, buffer);

      publicUrl = localRelativePath;
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      path: storagePath,
      folderId: numericFolder,
    });
  } catch (err: unknown) {
    console.error('[API POST /api/upload] Error:', err);
    const message = err instanceof Error ? err.message : 'Error al subir la imagen';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

