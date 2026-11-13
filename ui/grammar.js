// TOPIK-style grammar by level: 2 units x 6 patterns. Like the vocabulary, the level of each pattern follows
// common TOPIK textbooks; TOPIK itself publishes no official list.
// Pattern: [pattern, meaning, note, [[example, English], [example, English]], [question with ___, English, answer, [3 wrong options]]]
// The English line of each question makes exactly one option correct. Unit ids are `g<level>-<index>`: append, never reorder.
const GRAMMAR=[
  {level:1,units:[
    ['Particles',[
      ['은/는','topic marker: “as for…”','는 after a vowel, 은 after a consonant',[['저는 학생이에요.','I am a student.'],['이 책은 재미있어요.','This book is interesting.']],['동생___ 의사예요.','My younger sibling is a doctor.','은',['는','을','에']]],
      ['이/가','subject marker','가 after a vowel, 이 after a consonant',[['고양이가 귀여워요.','The cat is cute.'],['가방이 무거워요.','The bag is heavy.']],['비___ 와요.','It is raining.','가',['이','를','에서']]],
      ['을/를','object marker','를 after a vowel, 을 after a consonant',[['저는 사과를 먹어요.','I eat an apple.'],['친구가 책을 읽어요.','My friend reads a book.']],['저는 커피___ 마셔요.','I drink coffee.','를',['을','가','에']]],
      ['에','to, at (a place or a time)','where you go or are, and when',[['학교에 가요.','I go to school.'],['일곱 시에 일어나요.','I get up at seven o’clock.']],['주말___ 집에 있어요.','I am at home on the weekend.','에',['를','에서','이']]],
      ['에서','at, in (where an action happens); from','place of an action',[['도서관에서 공부해요.','I study at the library.'],['식당에서 밥을 먹어요.','I eat at a restaurant.']],['공원___ 운동해요.','I exercise in the park.','에서',['에','을','가']]],
      ['도','also, too','replaces 은/는, 이/가 and 을/를',[['저도 한국어를 배워요.','I also learn Korean.'],['동생도 커피를 좋아해요.','My younger sibling likes coffee too.']],['저는 김치를 좋아해요. 불고기___ 좋아해요.','I like kimchi. I like bulgogi too.','도',['가','에서','에']]],
    ]],
    ['First endings',[
      ['-아요/어요','polite present tense','the everyday polite ending',[['저는 매일 운동해요.','I exercise every day.'],['친구를 만나요.','I meet a friend.']],['지금 밥을 ___.','I am eating now.','먹어요',['먹었어요','먹고 싶어요','먹을 거예요']]],
      ['-았/었어요','past tense','what happened',[['어제 영화를 봤어요.','I watched a movie yesterday.'],['주말에 친구를 만났어요.','I met a friend on the weekend.']],['어제 비가 ___.','It rained yesterday.','왔어요',['와요','올 거예요','오고 싶어요']]],
      ['안','not','goes right before the verb or adjective',[['저는 커피를 안 마셔요.','I don’t drink coffee.'],['오늘은 안 바빠요.','I am not busy today.']],['저는 고기를 ___ 먹어요.','I don’t eat meat.','안',['도','잘','많이']]],
      ['-고 싶다','want to','add 싶어요 after the verb + 고',[['한국에 가고 싶어요.','I want to go to Korea.'],['물을 마시고 싶어요.','I want to drink water.']],['김치찌개를 ___.','I want to eat kimchi stew.','먹고 싶어요',['먹었어요','먹어요','먹지 마세요']]],
      ['-(으)세요','please (a polite request)','으세요 after a consonant',[['여기에 앉으세요.','Please sit here.'],['천천히 말하세요.','Please speak slowly.']],['이름을 여기에 ___.','Please write your name here.','쓰세요',['썼어요','쓰고 싶어요','쓸 거예요']]],
      ['-(으)ㄹ 거예요','will (future plan)','을 거예요 after a consonant',[['내일 친구를 만날 거예요.','I will meet a friend tomorrow.'],['다음 달에 이사할 거예요.','I will move next month.']],['주말에 집에서 ___.','I will rest at home this weekend.','쉴 거예요',['쉬었어요','쉬세요','쉬고 싶어요']]],
    ]],
  ]},
  {level:2,units:[
    ['Connecting ideas',[
      ['-고','and (then)','links two actions or descriptions',[['밥을 먹고 커피를 마셔요.','I eat and then drink coffee.'],['이 식당은 싸고 맛있어요.','This restaurant is cheap and tasty.']],['샤워를 ___ 잤어요.','I took a shower and then went to sleep.','하고',['하지만','하러','하면']]],
      ['-지만','but','contrast between two facts',[['한국어는 어렵지만 재미있어요.','Korean is difficult but fun.'],['비가 오지만 산책해요.','It is raining, but I take a walk.']],['이 가방은 ___ 가벼워요.','This bag is big but light.','크지만',['크고','커서','크면']]],
      ['-아서/어서','because, so','reason; not used with commands',[['배가 아파서 병원에 갔어요.','My stomach hurt, so I went to the hospital.'],['시간이 없어서 택시를 탔어요.','I had no time, so I took a taxi.']],['너무 ___ 일찍 잤어요.','I was so tired that I went to bed early.','피곤해서',['피곤하지만','피곤하면','피곤하고']]],
      ['-(으)러 가다','go (somewhere) to do','purpose of going or coming',[['책을 빌리러 도서관에 가요.','I go to the library to borrow a book.'],['친구를 만나러 카페에 갔어요.','I went to a café to meet a friend.']],['옷을 ___ 백화점에 가요.','I go to the department store to buy clothes.','사러',['사지만','사서','사면']]],
      ['-(으)면','if, when','condition',[['시간이 있으면 같이 영화 봐요.','If you have time, let’s watch a movie together.'],['봄이 오면 꽃이 펴요.','When spring comes, flowers bloom.']],['비가 ___ 집에 있을 거예요.','If it rains, I will stay home.','오면',['와서','오지만','오고']]],
      ['-기 전에','before (doing)','add 전에 after the verb + 기',[['자기 전에 이를 닦아요.','I brush my teeth before I sleep.'],['밥을 먹기 전에 손을 씻어요.','I wash my hands before eating.']],['수업이 ___ 숙제를 했어요.','I did my homework before class started.','시작하기 전에',['시작한 후에','시작해서','시작하면']]],
    ]],
    ['Ability and duty',[
      ['-(으)ㄹ 수 있다','can, be able to','없다 instead of 있다 = cannot',[['저는 한국어를 읽을 수 있어요.','I can read Korean.'],['여기에서 사진을 찍을 수 있어요.','You can take photos here.']],['저는 수영을 ___.','I can swim.','할 수 있어요',['해야 해요','하고 싶어요','하지 마세요']]],
      ['-아야/어야 하다','have to, must','obligation',[['내일까지 숙제를 내야 해요.','I have to hand in my homework by tomorrow.'],['약을 먹어야 해요.','I have to take medicine.']],['아침 일찍 ___.','I have to get up early in the morning.','일어나야 해요',['일어날 수 있어요','일어나고 싶어요','일어났어요']]],
      ['-지 마세요','please don’t','a polite “don’t”',[['여기에서 담배를 피우지 마세요.','Please don’t smoke here.'],['걱정하지 마세요.','Please don’t worry.']],['수업 시간에 전화를 ___.','Please don’t use your phone during class.','하지 마세요',['하세요','해야 해요','할 수 있어요']]],
      ['-(으)ㄴ 후에','after (doing)','은 후에 after a consonant',[['수업이 끝난 후에 친구를 만나요.','I meet a friend after class ends.'],['밥을 먹은 후에 산책해요.','I take a walk after eating.']],['영화를 ___ 저녁을 먹었어요.','I had dinner after watching the movie.','본 후에',['보기 전에','보러','보면']]],
      ['-는 (noun modifier)','that / which … (present action)','verb + 는 describes a noun',[['이것은 제가 좋아하는 노래예요.','This is a song I like.'],['저기 있는 사람이 제 동생이에요.','The person over there is my younger sibling.']],['제가 자주 ___ 식당이에요.','It is a restaurant I often go to.','가는',['가고','가서','가면']]],
      ['-(으)ㄹ까요?','shall we? / shall I?','a suggestion or an offer',[['같이 점심 먹을까요?','Shall we have lunch together?'],['창문을 열까요?','Shall I open the window?']],['주말에 같이 등산 ___?','Shall we go hiking together this weekend?','갈까요',['갔어요','가세요','가야 해요']]],
    ]],
  ]},
  {level:3,units:[
    ['Reasons and intentions',[
      ['-(으)니까','because, so (also with requests)','unlike -아서, works with commands and suggestions',[['비가 오니까 우산을 가져가세요.','It is raining, so take an umbrella.'],['늦었으니까 택시를 탑시다.','We are late, so let’s take a taxi.']],['날씨가 ___ 창문을 닫으세요.','It is cold, so please close the window.','추우니까',['추워서','춥지만','춥기 전에']]],
      ['-(으)ㄴ/는데','background: “…, and / but …”','sets up the situation for what follows',[['배가 고픈데 같이 밥 먹을래요?','I’m hungry; do you want to eat together?'],['이 옷은 예쁜데 너무 비싸요.','These clothes are pretty, but too expensive.']],['지금 시간이 ___ 커피 한잔할까요?','I have time now; shall we have a coffee?','있는데',['있어서','있지만','있기 전에']]],
      ['-(으)려고','in order to','the purpose of an action',[['한국 회사에 취직하려고 한국어를 공부해요.','I study Korean to get a job at a Korean company.'],['살을 빼려고 매일 걸어요.','I walk every day to lose weight.']],['친구에게 ___ 편지를 썼어요.','I wrote a letter to give to my friend.','주려고',['주니까','주는데','주면']]],
      ['-게 되다','come to, end up (doing)','a change that happened by circumstance',[['한국 드라마를 보고 한국어를 좋아하게 됐어요.','I came to like Korean after watching Korean dramas.'],['회사 때문에 서울에 살게 됐어요.','Because of work, I ended up living in Seoul.']],['열심히 연습해서 수영을 ___.','I practised hard, so I became good at swimming.','잘하게 됐어요',['잘하려고 해요','잘할까요','잘하지 마세요']]],
      ['-아/어 보다','try (doing)','try something for the first time',[['이 옷을 한번 입어 보세요.','Try these clothes on.'],['한국 음식을 만들어 봤어요.','I tried making Korean food.']],['이 김치를 한번 ___.','Try tasting this kimchi.','먹어 보세요',['먹게 됐어요','먹으려고 해요','먹지 마세요']]],
      ['-(으)ㄴ 적이 있다','have (ever) done','experience; 없다 = have never',[['저는 제주도에 가 본 적이 있어요.','I have been to Jeju Island.'],['한복을 입어 본 적이 없어요.','I have never worn a hanbok.']],['저는 한국 영화를 ___.','I have seen a Korean movie before.','본 적이 있어요',['보려고 해요','볼까요','보지 마세요']]],
    ]],
    ['Time and permission',[
      ['-는 동안','while, during','for the whole time something happens',[['제가 요리하는 동안 청소해 주세요.','Please clean while I cook.'],['방학 동안 고향에 갔어요.','I went to my hometown during the vacation.']],['기다리는 ___ 책을 읽었어요.','I read a book while waiting.','동안',['후에','전에','때문에']]],
      ['-기 때문에','because','a clear reason (not with commands)',[['길이 막히기 때문에 지하철을 타요.','I take the subway because the roads are congested.'],['내일 시험이 있기 때문에 공부해야 해요.','I have to study because I have an exam tomorrow.']],['감기에 ___ 학교에 못 갔어요.','I couldn’t go to school because I caught a cold.','걸렸기 때문에',['걸리려고','걸리는 동안','걸려 보면']]],
      ['-(으)ㄹ 때','when','at the time something happens',[['어릴 때 부산에 살았어요.','I lived in Busan when I was young.'],['시간이 있을 때 연락하세요.','Contact me when you have time.']],['___ 커피를 마셔요.','I drink coffee when I am tired.','피곤할 때',['피곤하려고','피곤하는 동안','피곤해 보면']]],
      ['-아/어도 되다','may, it’s OK to','asking for or giving permission',[['여기에 앉아도 돼요?','May I sit here?'],['창문을 열어도 돼요.','You may open the window.']],['이 컴퓨터를 ___?','May I use this computer?','써도 돼요',['쓰면 안 돼요','쓸 때','쓰려고']]],
      ['-(으)면 안 되다','must not','a prohibition',[['박물관에서 사진을 찍으면 안 돼요.','You must not take photos in the museum.'],['수업에 늦으면 안 돼요.','You must not be late for class.']],['여기에 차를 ___.','You must not park your car here.','세우면 안 돼요',['세워도 돼요','세운 적이 있어요','세우려고 해요']]],
      ['-거나','or','choose between actions',[['주말에는 책을 읽거나 영화를 봐요.','On weekends I read books or watch movies.'],['버스를 타거나 걸어가요.','I take the bus or walk.']],['저녁에는 음악을 ___ 산책해요.','In the evening I listen to music or take a walk.','듣거나',['듣는 동안','들어도','듣기 때문에']]],
    ]],
  ]},
  {level:4,units:[
    ['Cause and contrast',[
      ['-(으)ㄹ 뿐만 아니라','not only … but also','add 도 to the second part',[['그 식당은 음식이 맛있을 뿐만 아니라 값도 싸요.','That restaurant’s food is not only tasty but also cheap.'],['그는 노래를 잘할 뿐만 아니라 춤도 잘 춰요.','He not only sings well but also dances well.']],['이 방은 ___ 조용해요.','This room is not only bright but also quiet.','밝을 뿐만 아니라',['밝은 반면에','밝도록','밝다가']]],
      ['-는 바람에','because (something unexpected went wrong)','the result is usually negative',[['늦잠을 자는 바람에 회의에 늦었어요.','I overslept, so I was late for the meeting.'],['휴대폰이 고장 나는 바람에 연락을 못 했어요.','My phone broke, so I couldn’t contact you.']],['갑자기 비가 ___ 옷이 다 젖었어요.','It suddenly rained, so my clothes got all wet.','오는 바람에',['오도록','오는 대로','올수록']]],
      ['-(으)ㄴ/는 반면에','whereas, on the other hand','two opposite sides',[['형은 키가 큰 반면에 저는 키가 작아요.','My older brother is tall, whereas I am short.'],['이 일은 월급이 많은 반면에 너무 바빠요.','This job pays well, but on the other hand it is very busy.']],['도시는 ___ 공기가 나빠요.','The city is convenient, whereas the air is bad.','편리한 반면에',['편리하도록','편리할수록','편리한 채로']]],
      ['-다가','while doing … (and then)','an action is interrupted or changes',[['길을 걷다가 친구를 만났어요.','I ran into a friend while walking down the street.'],['공부하다가 잠이 들었어요.','I fell asleep while studying.']],['텔레비전을 ___ 잠이 들었어요.','I fell asleep while watching TV.','보다가',['보도록','볼수록','보는 반면에']]],
      ['-더라고요','I noticed that …','telling what you saw or felt yourself',[['그 영화가 생각보다 재미있더라고요.','I found that movie more fun than I expected.'],['서울은 밤에도 사람이 많더라고요.','I noticed Seoul is crowded even at night.']],['제주도에 가 보니까 바다가 정말 ___.','When I went to Jeju, I found the sea really beautiful.','아름답더라고요',['아름답도록','아름다울수록','아름답다가']]],
      ['-(으)ㄹ수록','the more …, the more …','often with -(으)면: 하면 할수록',[['한국어는 배울수록 재미있어요.','The more I learn Korean, the more fun it is.'],['사람이 많을수록 시끄러워요.','The more people there are, the noisier it gets.']],['이 노래는 ___ 좋아요.','The more I listen to this song, the more I like it.','들을수록',['듣다가','듣도록','듣는 바람에']]],
    ]],
    ['Purpose and manner',[
      ['-도록','so that, in order that','the goal of an action',[['감기에 걸리지 않도록 옷을 따뜻하게 입으세요.','Dress warmly so that you don’t catch a cold.'],['늦지 않도록 일찍 출발했어요.','I left early so that I wouldn’t be late.']],['뒤에 있는 사람도 ___ 크게 말해 주세요.','Please speak loudly so that the people in the back can hear too.','들을 수 있도록',['들을수록','듣다가','듣는 바람에']]],
      ['-는 대로','as soon as; just as','right after, or in the same way',[['집에 도착하는 대로 전화할게요.','I’ll call you as soon as I get home.'],['제가 말한 대로 해 보세요.','Try doing it the way I told you.']],['결과가 ___ 알려 드릴게요.','I’ll let you know as soon as the results come out.','나오는 대로',['나오도록','나올수록','나오다가']]],
      ['-(으)ㄹ 텐데','it will probably …, so …','an expectation that leads to advice',[['지금 출발하면 길이 막힐 텐데 조금 기다려요.','The roads will probably be busy if we leave now, so let’s wait a bit.'],['많이 피곤할 텐데 좀 쉬세요.','You must be very tired, so get some rest.']],['내일 비가 ___ 우산을 챙기세요.','It will probably rain tomorrow, so take an umbrella.','올 텐데',['오는 대로','오다가','올수록']]],
      ['-기는 하지만','it is true that …, but','admit one side, then add another',[['이 집은 넓기는 하지만 역에서 멀어요.','This house is spacious, but it is far from the station.'],['한국 음식을 좋아하기는 하지만 매운 건 못 먹어요.','I do like Korean food, but I can’t eat spicy things.']],['운동이 ___ 건강에 좋아요.','Exercise is hard, but it is good for your health.','힘들기는 하지만',['힘들도록','힘든 대로','힘들다가']]],
      ['-(으)ㄴ 채로','with … still (as it is)','a state that stays while doing something',[['신발을 신은 채로 방에 들어가면 안 돼요.','You must not enter the room with your shoes on.'],['창문을 연 채로 잠이 들었어요.','I fell asleep with the window open.']],['불을 ___ 잤어요.','I slept with the light on.','켠 채로',['켜도록','켜는 대로','켤수록']]],
      ['-(으)ㄴ/는 탓에','because of (blaming the cause)','the result is negative',[['날씨가 추운 탓에 감기에 걸렸어요.','I caught a cold because the weather was cold.'],['길이 막힌 탓에 약속에 늦었어요.','I was late for the appointment because of the traffic.']],['잠을 못 ___ 하루 종일 피곤했어요.','I was tired all day because I couldn’t sleep.','잔 탓에',['자도록','자는 대로','잘수록']]],
    ]],
  ]},
  {level:5,units:[
    ['Judging and expecting',[
      ['-는 셈이다','it amounts to, practically','a conclusion from the facts',[['일주일에 다섯 번 운동하니까 거의 매일 하는 셈이에요.','I exercise five times a week, so it is practically every day.'],['거의 다 맞았으니까 합격한 셈이에요.','I got almost everything right, so I practically passed.']],['한 달에 한 번만 만나니까 거의 안 ___.','We only meet once a month, so we practically don’t meet.','만나는 셈이에요',['만날 리가 없어요','만나기 마련이에요','만날 뻔했어요']]],
      ['-(으)ㄹ 리가 없다','there is no way that …','strong disbelief',[['그 사람이 거짓말을 할 리가 없어요.','There is no way that person would lie.'],['벌써 다 끝났을 리가 없어요.','There is no way it is already all finished.']],['그렇게 열심히 공부했는데 시험에 ___.','He studied so hard; there is no way he failed the exam.','떨어졌을 리가 없어요',['떨어지는 셈이에요','떨어지기 마련이에요','떨어질 뻔했어요']]],
      ['-기 마련이다','be bound to, naturally','something that always happens',[['누구나 실수하기 마련이에요.','Everyone is bound to make mistakes.'],['시간이 지나면 잊기 마련이에요.','As time passes, you naturally forget.']],['열심히 노력하면 결과가 ___.','If you work hard, the results are bound to be good.','좋기 마련이에요',['좋을 리가 없어요','좋을 뻔했어요','좋은 셈이었어요']]],
      ['-는 김에','while (I’m at it)','use one chance to do another thing',[['시장에 가는 김에 과일도 샀어요.','While going to the market, I bought some fruit too.'],['말이 나온 김에 하나 물어볼게요.','Since we are on the subject, let me ask you something.']],['서울에 ___ 친구도 만났어요.','While I was in Seoul anyway, I met a friend too.','간 김에',['갈 리가 없어서','가기 마련이라','갈 뻔해서']]],
      ['-(으)ㄹ 뻔하다','almost (happened)','something nearly happened but didn’t',[['늦잠을 자서 비행기를 놓칠 뻔했어요.','I overslept and almost missed my flight.'],['길에서 넘어질 뻔했어요.','I almost fell on the street.']],['빗길에 미끄러져서 크게 ___.','I slipped on the wet road and almost got badly hurt.','다칠 뻔했어요',['다치는 셈이에요','다칠 리가 없어요','다치기 마련이에요']]],
      ['-다시피','as (you know / see)','with verbs like 알다, 보다, 듣다',[['아시다시피 요즘 경제가 어려워요.','As you know, the economy is difficult these days.'],['보시다시피 방이 아주 넓어요.','As you can see, the room is very spacious.']],['___ 이번 행사는 취소되었습니다.','As you have heard, this event has been cancelled.','들으셨다시피',['들으실 리가 없어서','들으시는 김에','들으실 뻔해서']]],
    ]],
    ['Adding and concluding',[
      ['-(으)ㄴ/는 데다가','on top of that, besides','adds a second point of the same kind',[['비가 오는 데다가 바람도 불어요.','It is raining, and on top of that it is windy.'],['그 가게는 값이 싼 데다가 친절해요.','That shop is cheap, and on top of that it is friendly.']],['오늘은 ___ 머리도 아파요.','I am tired today, and on top of that I have a headache.','피곤한 데다가',['피곤할 리가 없고','피곤한 김에','피곤할 뻔해서']]],
      ['-고 말다','end up (doing), finally','often with regret',[['참으려고 했는데 결국 울고 말았어요.','I tried to hold back, but I ended up crying.'],['조심했지만 컵을 깨고 말았어요.','I was careful, but I ended up breaking the cup.']],['다이어트 중이었는데 케이크를 다 ___.','I was on a diet, but I ended up eating the whole cake.','먹고 말았어요',['먹는 셈이에요','먹을 리가 없어요','먹기 마련이에요']]],
      ['-는 한','as long as','a condition that must stay true',[['제가 살아 있는 한 당신을 잊지 않을 거예요.','As long as I live, I won’t forget you.'],['특별한 일이 없는 한 내일 갈게요.','Unless something comes up, I’ll go tomorrow.']],['포기하지 ___ 기회는 있어요.','As long as you don’t give up, there is a chance.','않는 한',['않는 김에','않고 말아서','않을 뻔해서']]],
      ['-(으)ㄹ 겸','partly to, also for','one action with two purposes',[['운동도 할 겸 걸어서 출근해요.','I walk to work, partly to get some exercise.'],['바람도 쐴 겸 공원에 갔어요.','I went to the park, partly to get some fresh air.']],['친구도 ___ 고향에 다녀왔어요.','I visited my hometown, partly to see my friends.','만날 겸',['만나는 한','만날 리가 없어','만나고 말아']]],
      ['-는 가운데','amid, while','formal: the situation around an event',[['많은 사람들이 지켜보는 가운데 경기가 시작되었습니다.','The match began as many people watched.'],['바쁘신 가운데 와 주셔서 감사합니다.','Thank you for coming despite being busy.']],['눈이 ___ 행사가 열렸습니다.','The event was held while snow was falling.','내리는 가운데',['내릴 겸','내리고 말아','내릴 리가 없이']]],
      ['-(으)므로','because (formal, written)','used in writing and formal speech',[['비가 많이 왔으므로 경기가 취소되었습니다.','Because it rained heavily, the game was cancelled.'],['이 제품은 품질이 우수하므로 인기가 많습니다.','This product is popular because its quality is excellent.']],['내일은 ___ 도서관이 문을 닫습니다.','Because tomorrow is a public holiday, the library is closed.','공휴일이므로',['공휴일인 김에','공휴일일 뻔해서','공휴일인 한']]],
    ]],
  ]},
  {level:6,units:[
    ['Formal writing',[
      ['-(으)ㄴ/는 바','what, as (formal)','바와 같이 = as … (stated)',[['위에서 설명한 바와 같이 결과는 긍정적이다.','As explained above, the results are positive.'],['정부는 발표한 바를 그대로 실행했다.','The government carried out exactly what it had announced.']],['앞에서 ___와 같이 이 문제는 매우 중요하다.','As mentioned earlier, this issue is very important.','언급한 바',['언급할지언정','언급하기 십상','언급한 마당']]],
      ['-(으)ㄹ지언정','even if … (I would rather)','a strong refusal',[['굶을지언정 남의 것은 훔치지 않겠다.','Even if I starve, I will not steal from others.'],['실패할지언정 포기하지는 않겠다.','Even if I fail, I will not give up.']],['손해를 ___ 거짓말은 하지 않겠다.','Even if I suffer a loss, I will not lie.','볼지언정',['보기 십상이라','보는 바','본 터라']]],
      ['-기 십상이다','very likely to (something bad)','a warning',[['서두르면 실수하기 십상이다.','If you hurry, you are very likely to make mistakes.'],['겨울에 무리하면 감기에 걸리기 십상이다.','If you overdo it in winter, you are likely to catch a cold.']],['준비 없이 시작하면 ___.','If you start without preparing, you are likely to fail.','실패하기 십상이다',['실패할지언정','실패한 바이다','실패할 나위가 없다']]],
      ['-(으)ㄴ/는 듯하다','seem to, appear to','듯한 before a noun',[['밖에 비가 오는 듯하다.','It seems to be raining outside.'],['그는 이미 그 사실을 알고 있는 듯했다.','He seemed to already know that fact.']],['그녀는 무언가를 ___ 표정이었다.','She had a look as if she were hiding something.','숨기는 듯한',['숨길지언정','숨기기 십상인','숨긴 마당인']]],
      ['-는 한편','while, meanwhile','two things happen side by side',[['그는 회사에 다니는 한편 대학원에서 공부한다.','He works at a company while also studying at graduate school.'],['수출이 늘어나는 한편 수입은 줄었다.','While exports increased, imports decreased.']],['정부는 세금을 ___ 복지 예산을 늘렸다.','The government cut taxes while increasing the welfare budget.','줄이는 한편',['줄일지언정','줄이기 십상','줄일 나위 없이']]],
      ['-기에','because, since (written)','the reason for what follows',[['날씨가 좋기에 산책을 나갔다.','The weather was nice, so I went out for a walk.'],['친구가 부탁하기에 도와주었다.','My friend asked me, so I helped.']],['값이 ___ 두 개를 샀다.','It was cheap, so I bought two.','싸기에',['쌀지언정','싸기 십상','싼 듯한']]],
    ]],
    ['Advanced expressions',[
      ['-(으)ㄴ/는 터라','since, as (the situation was)','explains the circumstances',[['아침을 거른 터라 배가 몹시 고팠다.','Since I had skipped breakfast, I was very hungry.'],['처음 가 보는 곳인 터라 길을 많이 헤맸다.','Since it was my first time there, I got lost a lot.']],['밤새 일을 ___ 너무 피곤하다.','Since I worked all night, I am very tired.','한 터라',['할지언정','하기 십상','할 나위 없이']]],
      ['-(으)ㄹ 나위가 없다','could not be better; needless to','더할 나위 없이 = perfectly',[['이번 여행은 더할 나위 없이 좋았다.','This trip could not have been better.'],['그의 실력은 말할 나위도 없다.','His skill goes without saying.']],['결과는 더 ___ 만족스러웠다.','The results were as satisfying as one could wish for.','바랄 나위 없이',['바랄지언정','바라기 십상으로','바란 터라']]],
      ['을/를 막론하고','regardless of','formal: whatever the case',[['나이를 막론하고 누구나 참여할 수 있다.','Anyone can take part, regardless of age.'],['남녀노소를 막론하고 인기가 많다.','It is popular with people of every age and gender.']],['이유를 ___ 폭력은 용납될 수 없다.','Regardless of the reason, violence cannot be tolerated.','막론하고',['불과하고','십상이고','나위 없이']]],
      ['에 불과하다','be merely, only','something is smaller than expected',[['그것은 소문에 불과하다.','That is merely a rumor.'],['참가자는 열 명에 불과했다.','There were only ten participants.']],['이 계획은 아직 아이디어에 ___.','This plan is still merely an idea.','불과하다',['막론하다','십상이다','나위 없다']]],
      ['-(으)ㄴ 마당에','now that, at this point','when it is already too late to change',[['일이 이렇게 된 마당에 누구를 탓하겠어요?','Now that it has come to this, who can I blame?'],['다 끝난 마당에 후회해도 소용없다.','Now that it is all over, regret is useless.']],['회사를 그만둔 ___ 망설일 이유가 없다.','Now that I have quit the company, there is no reason to hesitate.','마당에',['십상에','나위에','불과에']]],
      ['-거니와','not only … but (literary)','adds a further, stronger point',[['그는 머리도 좋거니와 성실하기까지 하다.','He is not only smart but diligent as well.'],['날씨도 춥거니와 길도 미끄럽다.','Not only is it cold, but the roads are slippery too.']],['이 책은 내용도 ___ 그림도 아름답다.','This book not only has good content, but its pictures are beautiful too.','좋거니와',['좋을지언정','좋기 십상이고','좋은 마당에']]],
    ]],
  ]},
];
if(typeof module!=='undefined')module.exports={GRAMMAR};
