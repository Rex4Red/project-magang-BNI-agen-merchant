import { NextRequest, NextResponse } from 'next/server';
import { resolveSearchArea } from '@/lib/search-area';
export async function GET(request:NextRequest){
 const name=request.nextUrl.searchParams.get('area')?.trim();
 if(!name||name.length>100)return NextResponse.json({error:'Masukkan nama daerah, maksimal 100 karakter.'},{status:400});
 try{const area=await resolveSearchArea(name);if(!area)return NextResponse.json({error:'Daerah tidak ditemukan.'},{status:404});return NextResponse.json(area);}
 catch{return NextResponse.json({error:'Pencarian daerah gagal. Geser peta secara manual atau coba lagi.'},{status:502});}
}
