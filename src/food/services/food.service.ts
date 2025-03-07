import { Injectable } from '@nestjs/common';
import { ILike, Repository } from 'typeorm';
import { Food } from '../entity/food.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { FoodGroup } from '../entity/food-group.entity';
import { AnalyzeFoodSaveDto } from '../dto/analyze-food-save.dto';
import { FoodHistory } from '../entity/food-history.entity';
import { ScanHistory } from '../entity/scan-history.entity';
import { FoodRate } from '../entity/food-rate.entity';
import { FoodDetailResponseDto } from '../dto/food-detail.response.dto';
import { User } from 'src/user/entity/user.entity';
import { PointHistory } from 'src/point/entity/point-history.entity';
import { StorageService } from './cloud-storage.service';
import axios from 'axios';
import * as FormData from 'form-data';
import { firstValueFrom } from 'rxjs';
import { HttpService } from '@nestjs/axios';

@Injectable()
export class FoodService {
  constructor(
    @InjectRepository(FoodHistory)
    private foodHistoryRepository: Repository<FoodHistory>,
    @InjectRepository(ScanHistory)
    private scanHistoryRepository: Repository<ScanHistory>,
    @InjectRepository(FoodRate)
    private foodRateRepository: Repository<FoodRate>,
    @InjectRepository(Food)
    private foodRepository: Repository<Food>,
    @InjectRepository(FoodGroup)
    private foodGroupRepository: Repository<FoodGroup>,
    @InjectRepository(PointHistory)
    private pointHistoryRepository: Repository<PointHistory>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    private readonly storageService: StorageService,
    private readonly httpService: HttpService,
  ) {}

  async addFoodHistory(userId: string, foodId: number): Promise<FoodHistory> {
    const foodHistory = this.foodHistoryRepository.create({
      user: { id: userId },
      food: { id: foodId },
    });

    await this.foodHistoryRepository.save(foodHistory);

    return foodHistory;
  }

  async addScanHistory(userId: string): Promise<ScanHistory> {
    const scanHistory = this.scanHistoryRepository.create({
      user: { id: userId },
    });

    await this.scanHistoryRepository.save(scanHistory);

    return scanHistory;
  }

  async getFoodById(
    userId: string,
    foodId: number,
  ): Promise<FoodDetailResponseDto> {
    const food = await this.foodRepository.findOne({ where: { id: foodId } });

    if (!food) {
      throw new Error('Food not found');
    }

    const tagsNames = await this.foodGroupRepository
      .createQueryBuilder('food_group')
      .where('food_group.id IN (:...ids)', { ids: food.tags })
      .getMany();

    food.tags = tagsNames.map((tag) => tag.name); // Ganti tags dengan nama FoodGroup

    const foodRate = await this.getFoodRate(userId, foodId);

    return {
      ...food,
      food_rate: foodRate,
    };
  }

  async getFoods(
    page: number = 1,
    limit: number = 10,
    name: string = '',
    tags: number[] = [],
  ): Promise<any> {
    const skip = (page - 1) * limit; // Menghitung offset berdasarkan halaman yang diminta
    const whereConditions: any = {};

    // Filter berdasarkan nama makanan jika ada (case-insensitive)
    if (name) {
      whereConditions.name = ILike(`%${name}%`); // Menggunakan ILike untuk pencarian tanpa memperhatikan kapitalisasi
    }

    // Membuat query dengan QueryBuilder
    const queryBuilder = this.foodRepository.createQueryBuilder('food');

    // Filter berdasarkan tags jika ada
    if (tags.length > 0) {
      queryBuilder.andWhere('food.tags @> :tags', {
        tags: JSON.stringify(tags),
      });
    }
    if (name) {
      queryBuilder.andWhere('food.name ILIKE :name', { name: `%${name}%` });
    }

    queryBuilder.skip(skip).take(limit);

    queryBuilder.select([
      'food.id',
      'food.name',
      'food.tags',
      'food.grade',
      'food.image_url',
      'food.type',
    ]);

    // Eksekusi query untuk mendapatkan data yang sesuai dengan filter dan pagination
    const foods = await queryBuilder.getMany();

    // Menghitung jumlah total data berdasarkan filter yang sama (tags dan name)
    const countQueryBuilder = this.foodRepository.createQueryBuilder('food');

    if (tags.length > 0) {
      countQueryBuilder.andWhere('food.tags @> :tags', {
        tags: JSON.stringify(tags),
      });
    }

    if (name) {
      countQueryBuilder.andWhere('food.name ILIKE :name', {
        name: `%${name}%`,
      });
    }

    const total = await countQueryBuilder.getCount(); // Hitung total berdasarkan filter yang sama

    // Menghitung jumlah total halaman (total data / limit per halaman)
    const totalPages = Math.ceil(total / limit);

    // Mengambil nama-nama FoodGroup berdasarkan tag ID yang ada di setiap Food
    for (const food of foods) {
      // Ambil tags yang ada di dalam array tags
      const tagsNames = await this.foodGroupRepository
        .createQueryBuilder('food_group')
        .where('food_group.id IN (:...ids)', { ids: food.tags })
        .getMany();

      // Map tags IDs ke nama FoodGroup
      // console.log(tagsNames);
      food.tags = tagsNames.map((tag) => tag.name); // Ganti tags dengan nama FoodGroup
    }

    return {
      data: foods,
      total,
      page,
      limit,
      totalPages,
    };
  }
  async getFoodRate(userId: string, foodId: number): Promise<number> {
    const foodRate = await this.foodRateRepository.findOne({
      where: {
        user: { id: userId }, // Relasi user dengan id
        food: { id: foodId }, // Relasi food dengan id
      },
    });

    if (!foodRate) {
      return 0;
    }

    return foodRate.rate;
  }
  async setFoodRate(
    userId: string,
    foodId: number,
    rate: number,
  ): Promise<FoodRate> {
    // Cari makanan berdasarkan foodId
    const food = await this.foodRepository.findOne({ where: { id: foodId } });

    if (!food) {
      throw new Error('Food not found');
    }

    // Cek apakah sudah ada rating untuk user dan food tertentu
    let foodRate = await this.foodRateRepository.findOne({
      where: {
        user: { id: userId }, // Relasi user dengan id
        food: { id: foodId }, // Relasi food dengan id
      },
    });

    if (foodRate) {
      // Jika sudah ada, update rating
      foodRate.rate = rate;
      await this.foodRateRepository.save(foodRate); // Simpan perubahan
    } else {
      // Jika belum ada, buat rating baru
      foodRate = this.foodRateRepository.create({
        user: { id: userId }, // Relasi user dengan id
        food: { id: foodId }, // Relasi food dengan id
        rate: rate,
      });
      await this.foodRateRepository.save(foodRate); // Simpan rating baru
    }

    // Kembalikan foodRate yang telah disimpan atau diperbarui
    return foodRate;
  }
  async fetchZetizenNews() {
    const url =
      'https://berita-indo-api-next.vercel.app/api/zetizen-jawapos-news/food-and-traveling';
    try {
      const response = await firstValueFrom(this.httpService.get(url));
      const data = response.data.data;

      // Filter hanya properti title, content, link, dan image
      const filteredData = data.map((item: any) => ({
        title: item.title,
        description: item.content,
        url: item.link,
        image_url: item.image,
      }));

      const randomIndex = Math.floor(Math.random() * filteredData.length);
      return filteredData[randomIndex];
    } catch (error) {
      throw new Error(`Failed to fetch data: ${error.message}`);
    }
  }
  async analyzeFoodNutrition(
    userId: string,
    file: Express.Multer.File,
  ): Promise<any> {
    const formData = new FormData();
    formData.append('file', file.buffer, file.originalname); // Kirim file dari memory storage

    try {
      const response = await axios.post(
        `${process.env.OCR_SERVICE}/predict`, // URL FastAPI
        formData,
        {
          headers: {
            ...formData.getHeaders(),
          },
        },
      );
      const user = await this.userRepository.findOne({ where: { id: userId } });
      user.point += 10;
      await this.userRepository.save(user);
      await this.createPointHistory(userId, 10);

      return {
        ...response.data,
        type: 'kemasan',
      }; // Hasil dari FastAPI
    } catch (error) {
      console.error('Error analyzing food nutrition:', error);
      throw new Error('Failed to analyze food nutrition');
    }
  }

  async createPointHistory(userId: string, point: number): Promise<void> {
    await this.pointHistoryRepository.save({
      user: { id: userId },
      point,
      description: 'Analyze food',
    });
  }

  async updateFoodImage(foodId: number, imageUrl: string): Promise<Food> {
    const food = await this.foodRepository.findOne({ where: { id: foodId } });

    if (!food) {
      throw new Error('Food not found');
    }

    food.image_url = imageUrl;

    return await this.foodRepository.save(food);
  }

  async saveFood(
    saveFoodDto: AnalyzeFoodSaveDto,
    userId: string,
  ): Promise<Food> {
    // Ambil semua food groups dari database
    const foodGroups = await this.foodGroupRepository.find();

    // Buat mapping nama ke ID
    const foodGroupMap = foodGroups.reduce((map, group) => {
      map[group.name.toLowerCase()] = group.id; // Mapping nama ke ID, nama dijadikan lowercase untuk pencocokan
      return map;
    }, {});

    // Konversi nama tags menjadi ID
    const tagIds = saveFoodDto.tags
      .split(',')
      .map((tagName) => foodGroupMap[tagName.trim().toLowerCase()])
      .filter((id) => id); // Filter untuk memastikan hanya ID valid yang disertakan

    // Buat objek food untuk disimpan
    const food = this.foodRepository.create({
      name: saveFoodDto.name,
      nutriscore: saveFoodDto.nutriscore,
      tags: tagIds, // Simpan ID tags
      grade: saveFoodDto.grade.charAt(0),
      type: 'Kemasan',
      calories: saveFoodDto.calories,
      fat: saveFoodDto.fat,
      sugar: saveFoodDto.sugar,
      fiber: saveFoodDto.fiber,
      protein: saveFoodDto.protein,
      natrium: saveFoodDto.natrium,
      vegetable: saveFoodDto.vegetable,
      image_url: '',
      image_nutrition_url: '',
    });

    // Simpan food ke database
    const savedFood = await this.foodRepository.save(food);
    await this.addFoodHistory(userId, savedFood.id);

    return savedFood;
  }
}
