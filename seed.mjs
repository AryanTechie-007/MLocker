import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding Media Locker initial database...");

  // Create default user
  const user = await prisma.user.upsert({
    where: { email: "guest@medialocker.local" },
    update: {},
    create: {
      name: "Aryan Explorer",
      email: "guest@medialocker.local",
    },
  });

  const sampleItems = [
    {
      userId: user.id,
      mediaType: "movie",
      externalId: "372651118",
      externalSource: "itunes",
      title: "Inception",
      posterUrl: "https://is1-ssl.mzstatic.com/image/thumb/Video113/v4/71/61/8a/71618a80-0442-f8d2-4ee7-674b77dc4a68/pr_source.lsr/600x600bb.jpg",
      year: 2010,
      genres: JSON.stringify(["Sci-Fi", "Action", "Thriller"]),
      overview: "Dom Cobb is a skilled thief, the absolute best in the dangerous art of extraction, stealing valuable secrets from deep within the subconscious during the dream state.",
      status: "completed",
      rating: 9.5,
      review: "A timeless masterpiece of tension, practical effects, and Hans Zimmer's iconic score.",
      isFavorite: true,
    },
    {
      userId: user.id,
      mediaType: "movie",
      externalId: "12345678",
      externalSource: "itunes",
      title: "Interstellar",
      posterUrl: "https://is1-ssl.mzstatic.com/image/thumb/Video124/v4/8e/31/32/8e3132c7-0e2c-ee91-3824-2c253457a414/pr_source.lsr/600x600bb.jpg",
      year: 2014,
      genres: JSON.stringify(["Sci-Fi", "Drama", "Adventure"]),
      overview: "When Earth becomes uninhabitable in the future, a farmer and ex-NASA pilot, Joseph Cooper, is tasked to pilot a spacecraft, along with a team of researchers, to find a new planet for humans.",
      status: "completed",
      rating: 10.0,
      review: "Emotional powerhouse. The soundtrack and relativity mechanics make this unforgettable.",
      isFavorite: true,
    },
    {
      userId: user.id,
      mediaType: "tv",
      externalId: "169",
      externalSource: "tvmaze",
      title: "Breaking Bad",
      posterUrl: "https://static.tvmaze.com/uploads/images/original_untouched/501/1253519.jpg",
      year: 2008,
      genres: JSON.stringify(["Drama", "Crime", "Thriller"]),
      overview: "A chemistry teacher diagnosed with inoperable lung cancer turns to manufacturing and selling methamphetamine with a former student in order to secure his family's future.",
      status: "completed",
      rating: 9.8,
      review: "One of the greatest character arcs ever put on television.",
      isFavorite: true,
      totalEpisodes: 62,
      watchedEpisodes: 62,
    },
    {
      userId: user.id,
      mediaType: "tv",
      externalId: "1371",
      externalSource: "tvmaze",
      title: "Severance",
      posterUrl: "https://static.tvmaze.com/uploads/images/original_untouched/473/1183204.jpg",
      year: 2022,
      genres: JSON.stringify(["Sci-Fi", "Mystery", "Thriller"]),
      overview: "Mark leads a team of office workers whose memories have been surgically divided between their work and personal lives.",
      status: "in_progress",
      rating: 9.0,
      review: "Incredible atmosphere and pacing. Waiting eagerly for season 2!",
      isFavorite: false,
      totalEpisodes: 9,
      watchedEpisodes: 7,
    },
    {
      userId: user.id,
      mediaType: "anime",
      externalId: "40748",
      externalSource: "jikan",
      title: "Jujutsu Kaisen",
      posterUrl: "https://cdn.myanimelist.net/images/anime/1171/109222l.jpg",
      year: 2020,
      genres: JSON.stringify(["Action", "Supernatural", "Fantasy"]),
      overview: "A boy swallows a cursed talisman - the finger of a demon - and becomes cursed himself. He enters a shaman's school to be able to locate the demon's other body parts and thus exorcise himself.",
      status: "in_progress",
      rating: 8.8,
      review: "Mappa animation goes crazy. Shibuya incident arc was cinema.",
      isFavorite: true,
      totalEpisodes: 47,
      watchedEpisodes: 38,
    },
    {
      userId: user.id,
      mediaType: "anime",
      externalId: "16498",
      externalSource: "jikan",
      title: "Attack on Titan",
      posterUrl: "https://cdn.myanimelist.net/images/anime/10/47347l.jpg",
      year: 2013,
      genres: JSON.stringify(["Action", "Drama", "Suspense"]),
      overview: "After his hometown is destroyed and his mother is killed, young Eren Jaeger vows to cleanse the earth of the giant humanoid Titans that have brought humanity to the brink of extinction.",
      status: "completed",
      rating: 9.7,
      review: "Generational storytelling and plot twists.",
      isFavorite: true,
      totalEpisodes: 89,
      watchedEpisodes: 89,
    },
    {
      userId: user.id,
      mediaType: "game",
      externalId: "elden-ring",
      externalSource: "manual",
      title: "Elden Ring",
      posterUrl: "https://images.unsplash.com/photo-1542751371-adc38448a05e?q=80&w=800&auto=format&fit=crop",
      year: 2022,
      genres: JSON.stringify(["Action RPG", "Open World", "Dark Fantasy"]),
      overview: "Rise, Tarnished, and be guided by grace to brandish the power of the Elden Ring and become an Elden Lord in the Lands Between.",
      status: "in_progress",
      rating: 9.9,
      review: "Exploration freedom is unrivaled. Malenia took 40 attempts.",
      isFavorite: true,
      hoursPlayed: 124.5,
    },
    {
      userId: user.id,
      mediaType: "game",
      externalId: "cyberpunk-2077",
      externalSource: "manual",
      title: "Cyberpunk 2077: Phantom Liberty",
      posterUrl: "https://images.unsplash.com/photo-1578632767115-351597cf2477?q=80&w=800&auto=format&fit=crop",
      year: 2023,
      genres: JSON.stringify(["RPG", "Cyberpunk", "Action"]),
      overview: "As cyber-enhanced mercenary V, join secret agent Solomon Reed to unravel a web of shattered loyalties in the deadly district of Dogtown.",
      status: "completed",
      rating: 9.3,
      review: "Night City is visually breathtaking and Dogtown has an incredible spy-thriller storyline.",
      isFavorite: true,
      hoursPlayed: 85.0,
    },
    {
      userId: user.id,
      mediaType: "novel",
      externalId: "OL893415W",
      externalSource: "openlibrary",
      title: "Dune",
      posterUrl: "https://covers.openlibrary.org/b/id/12836262-L.jpg",
      year: 1965,
      genres: JSON.stringify(["Sci-Fi", "Epic", "Adventure"]),
      overview: "Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides, heir to a noble family tasked with ruling an inhospitable world where the only thing of value is the 'spice' melange.",
      status: "completed",
      rating: 9.4,
      review: "Masterpiece of worldbuilding and ecology.",
      isFavorite: true,
    },
    {
      userId: user.id,
      mediaType: "manga",
      externalId: "2",
      externalSource: "jikan",
      title: "Berserk",
      posterUrl: "https://cdn.myanimelist.net/images/manga/1/157897l.jpg",
      year: 1989,
      genres: JSON.stringify(["Dark Fantasy", "Action", "Horror"]),
      overview: "Guts, a former mercenary now known as the 'Black Swordsman', is out for revenge against his former comrade Griffith.",
      status: "in_progress",
      rating: 10.0,
      review: "Kentaro Miura's artwork is unmatched in manga history.",
      isFavorite: true,
      totalChapters: 375,
      readChapters: 215,
    },
  ];

  for (const item of sampleItems) {
    await prisma.userMedia.upsert({
      where: {
        userId_mediaType_externalId: {
          userId: item.userId,
          mediaType: item.mediaType,
          externalId: item.externalId,
        },
      },
      update: item,
      create: item,
    });
  }

  // Create a sample collection
  const collection = await prisma.collection.upsert({
    where: { id: "col-masterpieces" },
    update: {},
    create: {
      id: "col-masterpieces",
      userId: user.id,
      name: "All-Time Masterpieces",
      description: "My personal 9.5+ rated works across cinema, gaming, anime, and literature.",
    },
  });

  // Link items to collection
  const mediaItems = await prisma.userMedia.findMany({ where: { userId: user.id } });
  for (let i = 0; i < mediaItems.length; i++) {
    if (mediaItems[i].rating && mediaItems[i].rating >= 9.5) {
      await prisma.collectionItem.upsert({
        where: {
          collectionId_userMediaId: {
            collectionId: collection.id,
            userMediaId: mediaItems[i].id,
          },
        },
        update: {},
        create: {
          collectionId: collection.id,
          userMediaId: mediaItems[i].id,
          order: i,
        },
      });
    }
  }

  console.log("Seeding completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
